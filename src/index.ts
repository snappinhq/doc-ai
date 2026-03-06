import {
    TextractClient,
    AnalyzeDocumentCommand,
    type Block,
    FeatureType,
} from "@aws-sdk/client-textract";
import { createVertex } from "@ai-sdk/google-vertex";
import { generateText, Output } from "ai";
import { PDFDocument } from "pdf-lib";

import { cleanTextractOutput } from "./lib/textract.cleaner";
import { InferTemplate, TemplateEngine, type DocumentTemplate } from "./lib/template.engine";
import { invoiceTemplate } from "./templates/invoice";
import { BASE_EXTRACTION_PROMPT } from "./prompt";
import { parseCredentials } from "./lib/parseCredentials";
import {
    DocAIError,
    DocAIErrorCode,
    validateBuffer,
    remapPdfError,
    remapTextractError,
    remapGeminiError,
} from "./errors";

export type { DocumentTemplate, TemplateField, TemplateFieldType } from "./lib/template.engine";
export type { CleanedTextractOutput } from "./lib/textract.cleaner";
export { invoiceTemplate } from "./templates/invoice";
export { DocAIError, DocAIErrorCode } from "./errors";

// ─── Config ───────────────────────────────────────────────────────────────────

export interface TextractConfig {
    region: string;
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
    };
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

export interface ExtractionOptions<T extends DocumentTemplate = typeof invoiceTemplate> {
    template?: T;
    featureTypes?: ("TABLES" | "FORMS" | "SIGNATURES" | "LAYOUT")[];
}

export interface ExtractionOutput<TData = Record<string, unknown>> {
    totalPages: number;
    totalInvoices: number;
    data: TData[];
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

// ─── Class ────────────────────────────────────────────────────────────────────

export class SnappinDocAI {
    protected readonly textractClient: TextractClient;
    protected readonly google: ReturnType<typeof createVertex>;

    constructor({ vertex, textract }: SnappinDocAIConfig) {
        this.textractClient = new TextractClient({
            region: textract.region,
            credentials: {
                accessKeyId: textract.credentials.accessKeyId,
                secretAccessKey: textract.credentials.secretAccessKey,
            },
        });

        const credentials = parseCredentials(vertex.credentials);
        this.google = createVertex({
            project: vertex.projectId,
            location: vertex.location ?? "us-central1",
            googleAuthOptions: { credentials },
        });
    }

    async extract<T extends DocumentTemplate = typeof invoiceTemplate>(
        buffer: Buffer | Uint8Array,
        options: ExtractionOptions<T> = {}
    ): Promise<ExtractionOutput<InferTemplate<T>>> {
        // ── Validate ────────────────────────────────────────────────────────
        validateBuffer(buffer);

        const totalStart = Date.now();
        const { template = invoiceTemplate, featureTypes = ["TABLES", "FORMS"] } = options;
        const { zod: outputSchema } = TemplateEngine.toOutputSchema(template);

        const requiredFields = template.fields
            .filter((f) => !('optional' in f && f.optional))
            .map((f) => f.name);

        // ── Stage 1: Textract ────────────────────────────────────────────────
        let blocks: Block[];
        let pageCount: number;

        try {
            const textractStart = Date.now();
            const textractResult = await this._runTextract(buffer, featureTypes);
            blocks = textractResult.blocks;
            pageCount = textractResult.pageCount;
            var textractDurationMs = Date.now() - textractStart;
        } catch (err) {
            if (err instanceof DocAIError) throw err;
            remapTextractError(err);
        }

        const cleaned = cleanTextractOutput(blocks!);

        // ── Stage 2: Gemini normalize ────────────────────────────────────────
        let normalizeResult: Awaited<ReturnType<typeof generateText>>;

        try {
            const normalizeStart = Date.now();
            normalizeResult = await generateText({
                model: this.google("gemini-2.0-flash-lite"),
                topP: 0,
                maxOutputTokens: 4000,
                system: BASE_EXTRACTION_PROMPT,
                prompt: JSON.stringify(cleaned),
                experimental_output: Output.object({ schema: outputSchema }),
            });
            var geminiDurationMs = Date.now() - normalizeStart;
        } catch (err) {
            if (err instanceof DocAIError) throw err;
            remapGeminiError(err);
        }

        if (!normalizeResult!.output) {
            throw new DocAIError({ code: DocAIErrorCode.EXTRACTION_FAILED });
        }

        const finalOutput = normalizeResult!.output as ExtractionOutput<InferTemplate<T>>;

        // ── Required fields check ────────────────────────────────────────────
        const missingFields = this._getMissingFields(finalOutput.data, requiredFields);
        if (missingFields.length > 0) {
            throw new DocAIError({
                code: DocAIErrorCode.REQUIRED_FIELDS_MISSING,
                missingFields,
            });
        }

        return {
            ...finalOutput,
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
                textractCallCount: pageCount!,
                cleanedTextLength: cleaned.text.length,
                pipeline: "textract_then_gemini",
            },
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Returns field names that are missing or empty across ALL data entries */
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

    private async _getPageCount(buffer: Buffer | Uint8Array): Promise<number> {
        try {
            const pdfDoc = await PDFDocument.load(buffer, {
                ignoreEncryption: false,
            });
            return pdfDoc.getPageCount();
        } catch (err) {
            remapPdfError(err);
        }
    }

    private async _runTextract(
        buffer: Buffer | Uint8Array,
        featureTypes: ExtractionOptions["featureTypes"]
    ): Promise<{ blocks: Block[]; pageCount: number }> {
        let pdfDoc: PDFDocument;

        try {
            pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: false });
        } catch (err) {
            remapPdfError(err);
        }

        const pageCount = pdfDoc!.getPageCount();
        const allBlocks: Block[] = [];

        for (let i = 0; i < pageCount; i++) {
            try {
                const singlePage = await PDFDocument.create();
                const [copiedPage] = await singlePage.copyPages(pdfDoc!, [i]);
                singlePage.addPage(copiedPage);
                const pageBytes = await singlePage.save();

                const command = new AnalyzeDocumentCommand({
                    Document: { Bytes: pageBytes },
                    FeatureTypes: featureTypes as FeatureType[],
                });

                const result = await this.textractClient.send(command);
                const blocks = result.Blocks ?? [];

                for (const block of blocks) {
                    if (block.Page !== undefined) block.Page = i + 1;
                }

                allBlocks.push(...blocks);
            } catch (err) {
                if (err instanceof DocAIError) throw err;
                remapTextractError(err);
            }
        }

        return { blocks: allBlocks, pageCount };
    }
}

export type { InvoiceData } from "./templates/invoice"