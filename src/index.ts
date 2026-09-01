import {
    TextractClient,
    StartDocumentAnalysisCommand,
    GetDocumentAnalysisCommand,
    type Block,
    FeatureType,
} from "@aws-sdk/client-textract";
import { createVertex } from "@ai-sdk/google-vertex";
import { generateText, Output } from "ai";

import { cleanTextractOutput } from "./lib/textract.cleaner";
import { InvoiceData, ZExtractionOutput, ZInvoiceData } from "./templates/invoice";
import { BASE_EXTRACTION_PROMPT } from "./prompt";
import { parseCredentials } from "./lib/parseCredentials";
import {
    DocAIError,
    DocAIErrorCode,
    remapTextractError,
    remapGeminiError,
} from "./errors";

export type { CleanedTextractOutput } from "./lib/textract.cleaner";
export { DocAIError, DocAIErrorCode } from "./errors";
export { ZInvoiceData, ZExtractionOutput, ZInvoiceLineItem } from "./templates/invoice";
export type { InvoiceData, InvoiceLineItem } from "./templates/invoice";

export interface TextractConfig {
    region: string;
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    s3Bucket: string;
}

export interface VertexConfig {
    projectId: string;
    location?: string;
    credentials: Record<string, string> | string;
}

export interface SnappinDocAIConfig {
    vertex: VertexConfig;
    textract: TextractConfig;
}

export interface ExtractionOptions {
    featureTypes?: ("TABLES" | "FORMS" | "SIGNATURES" | "LAYOUT")[];
    /** Pass the existing S3 key if the file is already stored in your S3 bucket */
    s3ObjectKey?: string;
}

export interface ExtractionResult {
    totalPages: number;
    totalInvoices: number;
    data: import("./templates/invoice").InvoiceData[];
    documents: DocumentPage[];
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };
    metrics: {
        totalDurationMs: number;
        textractDurationMs: number;
        geminiDurationMs: number;
        pagesProcessed: number;
        textractCallCount: number;
        cleanedTextLength: number;
        pipeline: "textract_then_gemini";
    };
}

export interface DocumentPage {
    invoiceNumber: string;
    pages: number[];
    pageRange: string;
    isDuplicate?: boolean;
    duplicateOfIndex?: number;
}

// ─── Required fields derived from Zod schema ─────────────────────────────────

const REQUIRED_FIELDS = Object.entries(ZInvoiceData.shape)
    .filter(([, field]) => !field.isOptional())
    .map(([key]) => key);

// ─── Class ────────────────────────────────────────────────────────────────────

export class SnappinDocAI {
    protected readonly textractClient: TextractClient;
    protected readonly google: ReturnType<typeof createVertex>;
    protected readonly s3Bucket: string;

    constructor({ vertex, textract }: SnappinDocAIConfig) {
        this.textractClient = new TextractClient({
            region: textract.region,
            credentials: {
                accessKeyId: textract.credentials.accessKeyId,
                secretAccessKey: textract.credentials.secretAccessKey,
            },
        });
        this.s3Bucket = textract.s3Bucket;

        const credentials = parseCredentials(vertex.credentials);
        this.google = createVertex({
            project: vertex.projectId,
            location: vertex.location ?? "us-central1",
            googleAuthOptions: { credentials },
        });
    }

    async extract(
        options: ExtractionOptions = {}
    ): Promise<ExtractionResult> {

        const totalStart = Date.now();
        const { featureTypes = ["TABLES", "FORMS"], s3ObjectKey } = options;

        if (!s3ObjectKey) {
            throw new DocAIError({
                code: DocAIErrorCode.EXTRACTION_FAILED,
                message: "s3ObjectKey is required for Textract multi-page processing.",
            });
        }

        let blocks: Block[];
        let pageCount: number;

        try {
            const textractStart = Date.now();
            const textractResult = await this._runTextractAsyncS3(
                s3ObjectKey,
                featureTypes
            );
            blocks = textractResult.blocks;
            pageCount = textractResult.pageCount;
            var textractDurationMs = Date.now() - textractStart;
        } catch (err) {
            if (err instanceof DocAIError) throw err;
            remapTextractError(err);
        }

        const cleaned = cleanTextractOutput(blocks!);

        // ── Stage 2: Gemini normalization ────────────────────────────────────────
        let normalizeResult: Awaited<ReturnType<typeof generateText>>;

        try {
            const normalizeStart = Date.now();
            normalizeResult = await generateText({
                model: this.google("gemini-2.5-flash-lite"),
                topP: 0,
                maxOutputTokens: 4000,
                system: BASE_EXTRACTION_PROMPT,
                prompt: JSON.stringify(cleaned),
                experimental_output: Output.object({ schema: ZExtractionOutput }),
            });
            var geminiDurationMs = Date.now() - normalizeStart;
        } catch (err) {
            if (err instanceof DocAIError) throw err;
            remapGeminiError(err);
        }

        if (!normalizeResult!.output) {
            throw new DocAIError({ code: DocAIErrorCode.EXTRACTION_FAILED });
        }

        const finalOutput = normalizeResult!.output;

        // ── Check Required Fields ────────────────────────────────────────────────
        const missingFields = this._getMissingFields(finalOutput.data, REQUIRED_FIELDS);
        if (missingFields.length > 0) {
            throw new DocAIError({
                code: DocAIErrorCode.REQUIRED_FIELDS_MISSING,
                missingFields,
            });
        }

        const seenInvoices = new Map<string, number>();

        const documents: DocumentPage[] = finalOutput.data.map((inv: InvoiceData, index: number) => {
            const invoiceNumber = inv.invoiceId ?? "UNKNOWN";

            // Deterministically find which pages contain anchor strings of this invoice
            const matchedPages = new Set<number>();
            const targetTokens = [
                inv.invoiceId,
                inv.vendorName,
                inv.clientName
            ].filter((val): val is string => Boolean(val) && val!.length > 2);

            cleaned.linesWithPages.forEach(({ text, page }) => {
                const matchesTarget = targetTokens.some((token) =>
                    text.toLowerCase().includes(token.toLowerCase())
                );
                if (matchesTarget) {
                    matchedPages.add(page);
                }
            });

            // Fallback to sequential index if no textual match occurs
            const fallbackPage = Math.min(index + 1, cleaned.totalPages);
            const detectedPages = matchedPages.size > 0
                ? Array.from(matchedPages).sort((a, b) => a - b)
                : [fallbackPage];

            const isDuplicate = seenInvoices.has(invoiceNumber);
            const duplicateOfIndex = seenInvoices.get(invoiceNumber);

            if (!isDuplicate) {
                seenInvoices.set(invoiceNumber, index);
            }

            return {
                invoiceNumber,
                pages: detectedPages,
                pageRange: formatPageRange(detectedPages),
                isDuplicate,
                duplicateOfIndex,
            };
        })

        return {
            ...finalOutput,
            documents,
            usage: {
                inputTokens: normalizeResult!.usage.inputTokens ?? 0,
                outputTokens: normalizeResult!.usage.outputTokens ?? 0,
                totalTokens: normalizeResult!.usage.totalTokens ?? 0,
            },
            metrics: {
                totalDurationMs: Date.now() - totalStart,
                textractDurationMs: textractDurationMs!,
                geminiDurationMs: geminiDurationMs!,
                pagesProcessed: pageCount!,
                textractCallCount: 1,
                cleanedTextLength: cleaned.text.length,
                pipeline: "textract_then_gemini",
            },
        };
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private _getMissingFields(
        data: unknown[],
        requiredFields: string[]
    ): string[] {
        if (!data || data.length === 0) return requiredFields;

        return requiredFields.filter((field) =>
            data.some((entry) => {
                const val = (entry as Record<string, unknown>)[field];
                return val === undefined || val === null || val === "";
            })
        );
    }

    private async _runTextractAsyncS3(
        s3ObjectKey: string,
        featureTypes: ExtractionOptions["featureTypes"]
    ): Promise<{ blocks: Block[]; pageCount: number }> {
        // 1. Kick off asynchronous text extraction via S3 reference
        const startCommand = new StartDocumentAnalysisCommand({
            DocumentLocation: {
                S3Object: {
                    Bucket: this.s3Bucket,
                    Name: s3ObjectKey,
                },
            },
            FeatureTypes: featureTypes as FeatureType[],
        });

        const startResult = await this.textractClient.send(startCommand);
        const jobId = startResult.JobId;

        if (!jobId) {
            throw new DocAIError({ code: DocAIErrorCode.EXTRACTION_FAILED });
        }

        // 2. Poll Textract until completed and retrieve paginated output blocks
        const blocks = await this._pollJobResults(jobId);

        const pageBlocks = blocks.filter(b => b.BlockType === "PAGE");
        const pageCount = pageBlocks.length > 0 ? pageBlocks.length : 1;

        return { blocks, pageCount };
    }

    private async _pollJobResults(jobId: string): Promise<Block[]> {
        const blocks: Block[] = [];
        let nextToken: string | undefined;
        let isFinished = false;
        let pollInterval = 500;

        while (!isFinished) {
            const getCommand = new GetDocumentAnalysisCommand({
                JobId: jobId,
                NextToken: nextToken,
            });

            const result = await this.textractClient.send(getCommand);
            const status = result.JobStatus;

            if (status === "FAILED") {
                throw new Error("Textract async document analysis job failed.");
            }

            if (status === "IN_PROGRESS") {
                await new Promise((resolve) => setTimeout(resolve, pollInterval));
                pollInterval = Math.min(pollInterval * 1.2, 2500);
                continue;
            }

            if (result.Blocks) {
                blocks.push(...result.Blocks);
            }

            nextToken = result.NextToken;
            if (!nextToken) {
                isFinished = true;
            }
        }

        return blocks;
    }
}

function formatPageRange(pages: number[]): string {
    if (!pages || pages.length === 0) return "1";
    const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);

    const ranges: string[] = [];
    let start = sorted[0];
    let end = start;

    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === end + 1) {
            end = sorted[i];
        } else {
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = sorted[i];
            end = start;
        }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(", ");
}