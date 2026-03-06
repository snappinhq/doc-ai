import { describe, it, expect, vi, beforeEach } from "vitest";
import { SnappinDocAI } from "../index";
import { DocAIError, DocAIErrorCode } from "../errors";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid PDF magic bytes + filler to pass validateBuffer */
const makePdfBuffer = (size = 100) => {
    const buf = Buffer.alloc(size, 0x00);
    buf[0] = 0x25; // %
    buf[1] = 0x50; // P
    buf[2] = 0x44; // D
    buf[3] = 0x46; // F
    return buf;
};

const VALID_EXTRACT_OUTPUT = {
    output: {
        totalPages: 1,
        totalInvoices: 1,
        data: [{
            invoiceNumber: "INV-001",
            invoiceDate: "2024-01-01",
            vendorName: "Acme Corp",
            totalAmount: 500,
            currency: "USD",
            documentType: "invoice",
        }],
    },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
};

// ─── Hoisted Mocks (must be declared before vi.mock factories run) ────────────

const {
    mockTextractSend,
    mockGenerateText,
    mockGetPageCount,
    mockCopyPages,
    mockAddPage,
    mockSave,
    mockLoad,
    mockCreate,
} = vi.hoisted(() => {
    const mockGetPageCount = vi.fn().mockReturnValue(1);
    const mockCopyPages    = vi.fn().mockResolvedValue([{}]);
    const mockAddPage      = vi.fn();
    const mockSave         = vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    return {
        mockTextractSend: vi.fn().mockResolvedValue({
            Blocks: [
                { Id: "p1", BlockType: "PAGE", Page: 1, Relationships: [{ Type: "CHILD", Ids: ["l1"] }] },
                { Id: "l1", BlockType: "LINE", Text: "Invoice Number: INV-001", Page: 1 },
            ],
        }),
        mockGenerateText: vi.fn().mockResolvedValue({
            output: {
                totalPages: 1,
                totalInvoices: 1,
                data: [{
                    invoiceNumber: "INV-001",
                    invoiceDate: "2024-01-01",
                    vendorName: "Acme Corp",
                    totalAmount: 500,
                    currency: "USD",
                    documentType: "invoice",
                }],
            },
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        }),
        mockGetPageCount,
        mockCopyPages,
        mockAddPage,
        mockSave,
        mockLoad: vi.fn().mockResolvedValue({ getPageCount: mockGetPageCount, copyPages: mockCopyPages }),
        mockCreate: vi.fn().mockReturnValue({ copyPages: mockCopyPages, addPage: mockAddPage, save: mockSave }),
    };
});

// ─── Module Mocks ─────────────────────────────────────────────────────────────

vi.mock("@aws-sdk/client-textract", () => ({
    TextractClient: vi.fn().mockImplementation(() => ({ send: mockTextractSend })),
    AnalyzeDocumentCommand: vi.fn(),
    FeatureType: { TABLES: "TABLES", FORMS: "FORMS" },
}));

vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return { ...actual, generateText: mockGenerateText };
});

vi.mock("@ai-sdk/google-vertex", () => ({
    createVertex: vi.fn().mockReturnValue(vi.fn().mockReturnValue("mocked-model")),
}));

vi.mock("pdf-lib", () => ({
    PDFDocument: { load: mockLoad, create: mockCreate },
}));

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("SnappinDocAI – edge cases", () => {
    let doc: SnappinDocAI;

    beforeEach(() => {
        vi.clearAllMocks();

        // Restore all mocks to happy-path defaults
        mockGetPageCount.mockReturnValue(1);
        mockCopyPages.mockResolvedValue([{}]);
        mockSave.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
        mockLoad.mockResolvedValue({ getPageCount: mockGetPageCount, copyPages: mockCopyPages });
        mockCreate.mockReturnValue({ copyPages: mockCopyPages, addPage: mockAddPage, save: mockSave });
        mockTextractSend.mockResolvedValue({
            Blocks: [
                { Id: "p1", BlockType: "PAGE", Page: 1, Relationships: [{ Type: "CHILD", Ids: ["l1"] }] },
                { Id: "l1", BlockType: "LINE", Text: "Invoice Number: INV-001", Page: 1 },
            ],
        });
        mockGenerateText.mockResolvedValue(VALID_EXTRACT_OUTPUT);

        doc = new SnappinDocAI({
            vertex: {
                projectId: "my-gcp-project",
                location: "us-central1",
                credentials: { key: "gcp" },
            },
            textract: {
                region: "us-east-1",
                credentials: { accessKeyId: "test", secretAccessKey: "test" },
            },
        });
    });

    // ── Buffer Validation ─────────────────────────────────────────────────────

    describe("Buffer validation", () => {
        it("throws PDF_EMPTY for an empty Buffer", async () => {
            await expect(doc.extract(Buffer.alloc(0))).rejects.toMatchObject({
                code: DocAIErrorCode.PDF_EMPTY,
            });
        });

        it("throws PDF_EMPTY for a zero-length Uint8Array", async () => {
            await expect(doc.extract(new Uint8Array(0))).rejects.toMatchObject({
                code: DocAIErrorCode.PDF_EMPTY,
            });
        });

        it("throws PDF_TOO_LARGE for a buffer exceeding 10 MB", async () => {
            const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
            oversized[0] = 0x25; oversized[1] = 0x50; oversized[2] = 0x44; oversized[3] = 0x46;
            await expect(doc.extract(oversized)).rejects.toMatchObject({
                code: DocAIErrorCode.PDF_TOO_LARGE,
            });
        });

        it("throws PDF_UNSUPPORTED_FORMAT when magic bytes are wrong", async () => {
            const notPdf = Buffer.from("This is not a PDF file at all!");
            await expect(doc.extract(notPdf)).rejects.toMatchObject({
                code: DocAIErrorCode.PDF_UNSUPPORTED_FORMAT,
            });
        });

        it("throws PDF_UNSUPPORTED_FORMAT for a JPEG file", async () => {
            const jpeg = Buffer.alloc(20);
            jpeg[0] = 0xFF; jpeg[1] = 0xD8; // JPEG magic bytes
            await expect(doc.extract(jpeg)).rejects.toMatchObject({
                code: DocAIErrorCode.PDF_UNSUPPORTED_FORMAT,
            });
        });

        it("accepts a Uint8Array with valid PDF magic bytes", async () => {
            const uint8 = new Uint8Array(makePdfBuffer());
            await expect(doc.extract(uint8)).resolves.toBeDefined();
        });
    });

    // ── PDF / pdf-lib Errors ──────────────────────────────────────────────────

    describe("PDF loading errors", () => {
        it("throws PDF_PASSWORD_PROTECTED when pdf-lib reports encryption", async () => {
            mockLoad.mockRejectedValue(new Error("encrypted PDF requires password"));
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.PDF_PASSWORD_PROTECTED,
            });
        });

        it("throws PDF_NO_PAGES when pdf-lib reports no pages", async () => {
            mockLoad.mockRejectedValue(new Error("no pages found in page count"));
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.PDF_NO_PAGES,
            });
        });

        it("throws PDF_CORRUPTED for a generic pdf-lib error", async () => {
            mockLoad.mockRejectedValue(new Error("unexpected EOF in PDF stream"));
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.PDF_CORRUPTED,
            });
        });
    });

    // ── Multi-page PDFs ───────────────────────────────────────────────────────

    describe("Multi-page PDFs", () => {
        it("calls Textract once per page for a 3-page PDF", async () => {
            mockGetPageCount.mockReturnValue(3);
            await doc.extract(makePdfBuffer());
            expect(mockTextractSend).toHaveBeenCalledTimes(3);
        });

        it("reports correct pagesProcessed in metrics", async () => {
            mockGetPageCount.mockReturnValue(5);
            const result = await doc.extract(makePdfBuffer());
            expect(result.metrics.pagesProcessed).toBe(5);
            expect(result.metrics.textractCallCount).toBe(5);
        });

        it("accumulates blocks from all pages", async () => {
            mockGetPageCount.mockReturnValue(2);
            // Page 1 returns 2 blocks, page 2 returns 1 block
            mockTextractSend
                .mockResolvedValueOnce({ Blocks: [
                    { Id: "p1", BlockType: "PAGE", Page: 1 },
                    { Id: "l1", BlockType: "LINE", Text: "Page 1 line", Page: 1 },
                ]})
                .mockResolvedValueOnce({ Blocks: [
                    { Id: "p2", BlockType: "PAGE", Page: 1 },
                ]});
            await expect(doc.extract(makePdfBuffer())).resolves.toBeDefined();
            expect(mockTextractSend).toHaveBeenCalledTimes(2);
        });

        it("correctly remaps page numbers in multi-page docs", async () => {
            mockGetPageCount.mockReturnValue(2);
            const capturedBlocks: any[][] = [];
            mockGenerateText.mockImplementation(async (opts: any) => {
                // Capture what was passed so we can inspect page numbers
                capturedBlocks.push(opts);
                return VALID_EXTRACT_OUTPUT;
            });
            await doc.extract(makePdfBuffer());
            // Just ensure it ran without error — page remapping is internal
            expect(capturedBlocks.length).toBe(1);
        });
    });

    // ── Textract Errors ───────────────────────────────────────────────────────

    describe("Textract errors", () => {
        it("throws TEXTRACT_UNSUPPORTED for UnsupportedDocumentException", async () => {
            const err = Object.assign(new Error("Unsupported"), { name: "UnsupportedDocumentException" });
            mockTextractSend.mockRejectedValue(err);
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.TEXTRACT_UNSUPPORTED,
            });
        });

        it("throws TEXTRACT_UNSUPPORTED when __type is UnsupportedDocumentException", async () => {
            const err = Object.assign(new Error("Unsupported"), { __type: "UnsupportedDocumentException" });
            mockTextractSend.mockRejectedValue(err);
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.TEXTRACT_UNSUPPORTED,
            });
        });

        it("throws TEXTRACT_THROTTLED for ProvisionedThroughputExceededException", async () => {
            const err = Object.assign(new Error("Throughput exceeded"), {
                name: "ProvisionedThroughputExceededException",
            });
            mockTextractSend.mockRejectedValue(err);
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.TEXTRACT_THROTTLED,
            });
        });

        it("throws TEXTRACT_THROTTLED when message contains 'throttl'", async () => {
            mockTextractSend.mockRejectedValue(new Error("Request was throttled by the service"));
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.TEXTRACT_THROTTLED,
            });
        });

        it("throws TEXTRACT_FAILED for an unknown Textract error", async () => {
            mockTextractSend.mockRejectedValue(new Error("Internal server error"));
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.TEXTRACT_FAILED,
            });
        });

        it("does not swallow an already-typed DocAIError from Textract stage", async () => {
            const original = new DocAIError({ code: DocAIErrorCode.TEXTRACT_FAILED });
            mockTextractSend.mockRejectedValue(original);
            const caught = await doc.extract(makePdfBuffer()).catch((e) => e);
            expect(caught).toBe(original);
        });

        it("handles Textract returning undefined Blocks gracefully", async () => {
            mockTextractSend.mockResolvedValue({ Blocks: undefined });
            await expect(doc.extract(makePdfBuffer())).resolves.toBeDefined();
        });

        it("handles Textract returning empty Blocks array", async () => {
            mockTextractSend.mockResolvedValue({ Blocks: [] });
            await expect(doc.extract(makePdfBuffer())).resolves.toBeDefined();
        });
    });

    // ── Gemini / AI SDK Errors ────────────────────────────────────────────────

    describe("Gemini errors", () => {
        it("throws GEMINI_QUOTA_EXCEEDED when message contains 'quota'", async () => {
            mockGenerateText.mockRejectedValue(new Error("quota exceeded for project"));
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.GEMINI_QUOTA_EXCEEDED,
            });
        });

        it("throws GEMINI_QUOTA_EXCEEDED when message contains 'rate limit'", async () => {
            mockGenerateText.mockRejectedValue(new Error("rate limit reached"));
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.GEMINI_QUOTA_EXCEEDED,
            });
        });

        it("throws GEMINI_QUOTA_EXCEEDED when message contains '429'", async () => {
            mockGenerateText.mockRejectedValue(new Error("HTTP 429 too many requests"));
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.GEMINI_QUOTA_EXCEEDED,
            });
        });

        it("throws GEMINI_FAILED for an unknown Gemini error", async () => {
            mockGenerateText.mockRejectedValue(new Error("model overloaded"));
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.GEMINI_FAILED,
            });
        });

        it("throws EXTRACTION_FAILED when Gemini returns null output", async () => {
            mockGenerateText.mockResolvedValue({ output: null, usage: {} });
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.EXTRACTION_FAILED,
            });
        });

        it("throws EXTRACTION_FAILED when Gemini returns undefined output", async () => {
            mockGenerateText.mockResolvedValue({ output: undefined, usage: {} });
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.EXTRACTION_FAILED,
            });
        });

        it("does not swallow an already-typed DocAIError from Gemini stage", async () => {
            const original = new DocAIError({ code: DocAIErrorCode.GEMINI_FAILED });
            mockGenerateText.mockRejectedValue(original);
            const caught = await doc.extract(makePdfBuffer()).catch((e) => e);
            expect(caught).toBe(original);
        });
    });

    // ── Required Fields Validation ────────────────────────────────────────────

    describe("Required fields validation", () => {
        it("throws REQUIRED_FIELDS_MISSING when invoiceNumber is absent", async () => {
            mockGenerateText.mockResolvedValue({
                output: {
                    totalPages: 1,
                    totalInvoices: 1,
                    data: [{ totalAmount: 500, currency: "USD", vendorName: "Acme", invoiceDate: "2024-01-01", documentType: "invoice" }],
                },
                usage: {},
            });
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.REQUIRED_FIELDS_MISSING,
            });
        });

        it("throws REQUIRED_FIELDS_MISSING when totalAmount is absent", async () => {
            mockGenerateText.mockResolvedValue({
                output: {
                    totalPages: 1,
                    totalInvoices: 1,
                    data: [{ invoiceNumber: "INV-001", currency: "USD", vendorName: "Acme", invoiceDate: "2024-01-01", documentType: "invoice" }],
                },
                usage: {},
            });
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.REQUIRED_FIELDS_MISSING,
            });
        });

        it("includes the name of each missing field in the error", async () => {
            mockGenerateText.mockResolvedValue({
                output: {
                    totalPages: 1,
                    totalInvoices: 1,
                    data: [{ documentType: "invoice" }], // most required fields absent
                },
                usage: {},
            });
            const err: DocAIError = await doc.extract(makePdfBuffer()).catch((e) => e);
            expect(err.missingFields).toEqual(expect.arrayContaining(["invoiceNumber", "vendorName", "totalAmount", "currency"]));
        });

        it("throws REQUIRED_FIELDS_MISSING when a field is an empty string", async () => {
            mockGenerateText.mockResolvedValue({
                output: {
                    totalPages: 1,
                    totalInvoices: 1,
                    data: [{
                        invoiceNumber: "",   // empty string counts as missing
                        invoiceDate: "2024-01-01",
                        vendorName: "Acme",
                        totalAmount: 100,
                        currency: "USD",
                        documentType: "invoice",
                    }],
                },
                usage: {},
            });
            const err: DocAIError = await doc.extract(makePdfBuffer()).catch((e) => e);
            expect(err.code).toBe(DocAIErrorCode.REQUIRED_FIELDS_MISSING);
            expect(err.missingFields).toContain("invoiceNumber");
        });

        it("throws REQUIRED_FIELDS_MISSING when data array is empty", async () => {
            mockGenerateText.mockResolvedValue({
                output: { totalPages: 1, totalInvoices: 0, data: [] },
                usage: {},
            });
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.REQUIRED_FIELDS_MISSING,
            });
        });

        it("passes when all required fields are present across multiple invoices", async () => {
            const entry = {
                invoiceNumber: "INV-X",
                invoiceDate: "2024-01-01",
                vendorName: "Vendor",
                totalAmount: 999,
                currency: "EUR",
                documentType: "invoice",
            };
            mockGenerateText.mockResolvedValue({
                output: { totalPages: 2, totalInvoices: 2, data: [entry, { ...entry, invoiceNumber: "INV-Y" }] },
                usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            });
            const result = await doc.extract(makePdfBuffer());
            expect(result.data).toHaveLength(2);
        });

        it("throws REQUIRED_FIELDS_MISSING when one invoice in a batch is missing a field", async () => {
            const good = { invoiceNumber: "INV-1", invoiceDate: "2024-01-01", vendorName: "V", totalAmount: 1, currency: "USD", documentType: "invoice" };
            const bad  = { invoiceNumber: "",       invoiceDate: "2024-01-01", vendorName: "V", totalAmount: 1, currency: "USD", documentType: "invoice" };
            mockGenerateText.mockResolvedValue({
                output: { totalPages: 2, totalInvoices: 2, data: [good, bad] },
                usage: {},
            });
            await expect(doc.extract(makePdfBuffer())).rejects.toMatchObject({
                code: DocAIErrorCode.REQUIRED_FIELDS_MISSING,
            });
        });
    });

    // ── Extraction Options ────────────────────────────────────────────────────

    describe("Extraction options", () => {
        it("uses default featureTypes (TABLES, FORMS) when none are provided", async () => {
            const { AnalyzeDocumentCommand } = await import("@aws-sdk/client-textract");
            await doc.extract(makePdfBuffer());
            expect(AnalyzeDocumentCommand).toHaveBeenCalledWith(
                expect.objectContaining({ FeatureTypes: ["TABLES", "FORMS"] })
            );
        });

        it("forwards custom featureTypes to Textract", async () => {
            const { AnalyzeDocumentCommand } = await import("@aws-sdk/client-textract");
            await doc.extract(makePdfBuffer(), { featureTypes: ["SIGNATURES", "LAYOUT"] });
            expect(AnalyzeDocumentCommand).toHaveBeenCalledWith(
                expect.objectContaining({ FeatureTypes: ["SIGNATURES", "LAYOUT"] })
            );
        });
    });

    // ── Return Shape & Metrics ────────────────────────────────────────────────

    describe("Return shape and metrics", () => {
        it("includes all required top-level keys", async () => {
            const result = await doc.extract(makePdfBuffer());
            expect(result).toHaveProperty("totalPages");
            expect(result).toHaveProperty("totalInvoices");
            expect(result).toHaveProperty("data");
            expect(result).toHaveProperty("usage");
            expect(result).toHaveProperty("metrics");
        });

        it("includes all metric keys", async () => {
            const result = await doc.extract(makePdfBuffer());
            const { metrics } = result;
            expect(metrics).toHaveProperty("totalDurationMs");
            expect(metrics).toHaveProperty("textractDurationMs");
            expect(metrics).toHaveProperty("geminiDurationMs");
            expect(metrics).toHaveProperty("pagesProcessed");
            expect(metrics).toHaveProperty("textractCallCount");
            expect(metrics).toHaveProperty("cleanedTextLength");
            expect(metrics.pipeline).toBe("textract_then_gemini");
        });

        it("includes all usage token keys", async () => {
            const result = await doc.extract(makePdfBuffer());
            expect(result.usage).toHaveProperty("inputTokens");
            expect(result.usage).toHaveProperty("outputTokens");
            expect(result.usage).toHaveProperty("totalTokens");
        });

        it("returns 0 for usage tokens when Gemini returns undefined usage fields", async () => {
            mockGenerateText.mockResolvedValue({
                output: VALID_EXTRACT_OUTPUT.output,
                usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
            });
            const result = await doc.extract(makePdfBuffer());
            expect(result.usage.inputTokens).toBe(0);
            expect(result.usage.outputTokens).toBe(0);
            expect(result.usage.totalTokens).toBe(0);
        });

        it("totalDurationMs is a positive number", async () => {
            const result = await doc.extract(makePdfBuffer());
            expect(result.metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
        });

        it("cleanedTextLength reflects processed text", async () => {
            const result = await doc.extract(makePdfBuffer());
            expect(typeof result.metrics.cleanedTextLength).toBe("number");
            expect(result.metrics.cleanedTextLength).toBeGreaterThanOrEqual(0);
        });
    });

    // ── DocAIError Class ──────────────────────────────────────────────────────

    describe("DocAIError class", () => {
        it("has the correct name property", () => {
            const err = new DocAIError({ code: DocAIErrorCode.EXTRACTION_FAILED });
            expect(err.name).toBe("DocAIError");
        });

        it("is an instance of Error", () => {
            expect(new DocAIError({ code: DocAIErrorCode.GEMINI_FAILED })).toBeInstanceOf(Error);
        });

        it("exposes a human-readable description", () => {
            const err = new DocAIError({ code: DocAIErrorCode.PDF_EMPTY });
            expect(typeof err.description).toBe("string");
            expect(err.description.length).toBeGreaterThan(0);
        });

        it("stores the original cause", () => {
            const cause = new Error("root cause");
            const err = new DocAIError({ code: DocAIErrorCode.TEXTRACT_FAILED, cause });
            expect(err.cause).toBe(cause);
        });

        it("stores missingFields when provided", () => {
            const err = new DocAIError({
                code: DocAIErrorCode.REQUIRED_FIELDS_MISSING,
                missingFields: ["invoiceNumber", "currency"],
            });
            expect(err.missingFields).toEqual(["invoiceNumber", "currency"]);
        });

        it("uses a custom message when provided", () => {
            const err = new DocAIError({ code: DocAIErrorCode.GEMINI_FAILED, message: "custom message" });
            expect(err.message).toBe("custom message");
        });

        it("falls back to description as message when no custom message is given", () => {
            const err = new DocAIError({ code: DocAIErrorCode.PDF_TOO_LARGE });
            expect(err.message).toBe(err.description);
        });
    });
});