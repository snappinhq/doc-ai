// ─── Error Codes ─────────────────────────────────────────────────────────────

export const DocAIErrorCode = {
    // PDF errors
    PDF_EMPTY:              "PDF_EMPTY",
    PDF_TOO_LARGE:          "PDF_TOO_LARGE",
    PDF_PASSWORD_PROTECTED: "PDF_PASSWORD_PROTECTED",
    PDF_CORRUPTED:          "PDF_CORRUPTED",
    PDF_NO_PAGES:           "PDF_NO_PAGES",
    PDF_UNSUPPORTED_FORMAT: "PDF_UNSUPPORTED_FORMAT",

    // Textract errors
    TEXTRACT_UNSUPPORTED:   "TEXTRACT_UNSUPPORTED",
    TEXTRACT_THROTTLED:     "TEXTRACT_THROTTLED",
    TEXTRACT_FAILED:        "TEXTRACT_FAILED",

    // Gemini errors
    GEMINI_FAILED:          "GEMINI_FAILED",
    GEMINI_QUOTA_EXCEEDED:  "GEMINI_QUOTA_EXCEEDED",

    // Extraction errors
    EXTRACTION_FAILED:      "EXTRACTION_FAILED",
    REQUIRED_FIELDS_MISSING: "REQUIRED_FIELDS_MISSING",
} as const;

export type DocAIErrorCode = typeof DocAIErrorCode[keyof typeof DocAIErrorCode];

const ERROR_DESCRIPTIONS: Record<DocAIErrorCode, string> = {
    PDF_EMPTY:               "The provided buffer is empty or has no content.",
    PDF_TOO_LARGE:           "PDF exceeds the maximum allowed size of 10MB.",
    PDF_PASSWORD_PROTECTED:  "The PDF is password-protected and cannot be processed.",
    PDF_CORRUPTED:           "The PDF file appears to be corrupted or is not a valid PDF.",
    PDF_NO_PAGES:            "The PDF contains no pages.",
    PDF_UNSUPPORTED_FORMAT:  "The file format is not supported. Only PDF files are accepted.",
    TEXTRACT_UNSUPPORTED:    "AWS Textract could not process this document format.",
    TEXTRACT_THROTTLED:      "AWS Textract request was throttled. Please retry after a moment.",
    TEXTRACT_FAILED:         "AWS Textract failed to analyze the document.",
    GEMINI_FAILED:           "Gemini failed to process or normalize the extracted content.",
    GEMINI_QUOTA_EXCEEDED:   "Gemini API quota exceeded. Please retry later.",
    EXTRACTION_FAILED:       "Both extraction stages failed to produce a valid result.",
    REQUIRED_FIELDS_MISSING: "One or more required fields could not be extracted from the document.",
};

// ─── Custom Error Class ───────────────────────────────────────────────────────

export class DocAIError extends Error {
    readonly code: DocAIErrorCode;
    readonly description: string;
    readonly missingFields?: string[];
    readonly cause?: unknown;

    constructor({
        code,
        missingFields,
        cause,
        message,
    }: {
        code: DocAIErrorCode;
        missingFields?: string[];
        cause?: unknown;
        message?: string;
    }) {
        const description = ERROR_DESCRIPTIONS[code];
        super(message ?? description);
        this.name = "DocAIError";
        this.code = code;
        this.description = description;
        this.missingFields = missingFields;
        this.cause = cause;
    }
}

// ─── PDF Validation ───────────────────────────────────────────────────────────

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

export function validateBuffer(buffer: Buffer | Uint8Array): void {
    if (!buffer || buffer.length === 0) {
        throw new DocAIError({ code: DocAIErrorCode.PDF_EMPTY });
    }
    if (buffer.length > MAX_PDF_SIZE) {
        throw new DocAIError({ code: DocAIErrorCode.PDF_TOO_LARGE });
    }
    // Check PDF magic bytes: %PDF
    if (
        buffer[0] !== 0x25 || // %
        buffer[1] !== 0x50 || // P
        buffer[2] !== 0x44 || // D
        buffer[3] !== 0x46    // F
    ) {
        throw new DocAIError({ code: DocAIErrorCode.PDF_UNSUPPORTED_FORMAT });
    }
}

// ─── Error Remapping Helpers ──────────────────────────────────────────────────

/** Remap pdf-lib errors to typed DocAIErrors */
export function remapPdfError(err: unknown): never {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";

    if (msg.includes("encrypted") || msg.includes("password")) {
        throw new DocAIError({ code: DocAIErrorCode.PDF_PASSWORD_PROTECTED, cause: err });
    }
    if (msg.includes("no pages") || msg.includes("page count")) {
        throw new DocAIError({ code: DocAIErrorCode.PDF_NO_PAGES, cause: err });
    }
    throw new DocAIError({ code: DocAIErrorCode.PDF_CORRUPTED, cause: err });
}

/** Remap Textract errors to typed DocAIErrors */
export function remapTextractError(err: unknown): never {
    const name = (err as { name?: string })?.name ?? "";
    const type = (err as { __type?: string })?.__type ?? "";
    const msg = err instanceof Error ? err.message.toLowerCase() : "";

    if (name === "UnsupportedDocumentException" || type === "UnsupportedDocumentException") {
        throw new DocAIError({ code: DocAIErrorCode.TEXTRACT_UNSUPPORTED, cause: err });
    }
    if (name === "ProvisionedThroughputExceededException" || msg.includes("throttl")) {
        throw new DocAIError({ code: DocAIErrorCode.TEXTRACT_THROTTLED, cause: err });
    }
    throw new DocAIError({ code: DocAIErrorCode.TEXTRACT_FAILED, cause: err });
}

/** Remap Gemini/AI SDK errors to typed DocAIErrors */
export function remapGeminiError(err: unknown): never {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";

    if (msg.includes("quota") || msg.includes("rate limit") || msg.includes("429")) {
        throw new DocAIError({ code: DocAIErrorCode.GEMINI_QUOTA_EXCEEDED, cause: err });
    }
    throw new DocAIError({ code: DocAIErrorCode.GEMINI_FAILED, cause: err });
}