import { TextractClient } from '@aws-sdk/client-textract';
import { createVertex } from '@ai-sdk/google-vertex';

type TemplateFieldType = "string" | "number" | "boolean" | "date" | "string[]" | "number[]" | "object[]";
interface TemplateField {
    readonly name: string;
    readonly type: TemplateFieldType;
    readonly description: string;
    readonly optional?: boolean;
    /** Nested fields — required when type is "object[]" */
    readonly fields?: readonly TemplateField[];
    /** Constrain to specific string values — generates a union type + z.enum() */
    readonly enum?: readonly [string, ...string[]];
}
interface DocumentTemplate {
    readonly name: string;
    readonly description?: string;
    readonly fields: readonly TemplateField[];
}
type FieldTypeMap = {
    string: string;
    number: number;
    boolean: boolean;
    date: string;
    "string[]": string[];
    "number[]": number[];
    "object[]": Record<string, unknown>;
};
type InferFieldValue<F extends TemplateField> = F extends {
    readonly enum: readonly (infer E extends string)[];
} ? E : F extends {
    readonly type: "object[]";
    readonly fields: readonly TemplateField[];
} ? InferTemplateShape<F["fields"]>[] : F["type"] extends keyof FieldTypeMap ? FieldTypeMap[F["type"]] : never;
type InferTemplateField<F extends TemplateField> = F extends {
    readonly optional: true;
} ? InferFieldValue<F> | undefined : InferFieldValue<F>;
type InferTemplateShape<Fields extends readonly TemplateField[]> = {
    [F in Fields[number] as F["name"]]: InferTemplateField<F>;
};
/** Infer the TypeScript output type from a DocumentTemplate */
type InferTemplate<T extends DocumentTemplate> = InferTemplateShape<T["fields"]>;

declare const invoiceTemplate: {
    readonly name: "invoice";
    readonly description: "Standard invoice data extraction template";
    readonly fields: readonly [{
        readonly name: "invoiceNumber";
        readonly type: TemplateFieldType;
        readonly description: "The invoice number, reference ID, or document number";
    }, {
        readonly name: "invoiceDate";
        readonly type: TemplateFieldType;
        readonly description: "The date the invoice was issued, in ISO 8601 format (YYYY-MM-DD)";
    }, {
        readonly name: "dueDate";
        readonly type: TemplateFieldType;
        readonly description: "Payment due date in ISO 8601 format (YYYY-MM-DD). Omit if not present.";
        readonly optional: true;
    }, {
        readonly name: "invoiceStatus";
        readonly type: TemplateFieldType;
        readonly description: "Current status of the invoice if mentioned. Omit if not stated.";
        readonly optional: true;
        readonly enum: readonly ["paid", "unpaid", "overdue", "draft", "cancelled", "partial"];
    }, {
        readonly name: "paymentTerms";
        readonly type: TemplateFieldType;
        readonly description: "Payment terms as stated on the invoice. Omit if not present.";
        readonly optional: true;
    }, {
        readonly name: "vendorName";
        readonly type: TemplateFieldType;
        readonly description: "Full legal name of the company or individual issuing the invoice";
    }, {
        readonly name: "vendorAddress";
        readonly type: TemplateFieldType;
        readonly description: "Full mailing address of the vendor/seller";
        readonly optional: true;
    }, {
        readonly name: "vendorEmail";
        readonly type: TemplateFieldType;
        readonly description: "Email address of the vendor, if present";
        readonly optional: true;
    }, {
        readonly name: "vendorWebsite";
        readonly type: TemplateFieldType;
        readonly description: "Website URL of the vendor, if present";
        readonly optional: true;
    }, {
        readonly name: "vendorPhone";
        readonly type: TemplateFieldType;
        readonly description: "Phone number of the vendor, if present";
        readonly optional: true;
    }, {
        readonly name: "vendorTaxId";
        readonly type: TemplateFieldType;
        readonly description: "Vendor's tax identification number. Omit if not present.";
        readonly optional: true;
    }, {
        readonly name: "vendorRegId";
        readonly type: TemplateFieldType;
        readonly description: "Vendor's business registration number. Omit if not present.";
        readonly optional: true;
    }, {
        readonly name: "clientName";
        readonly type: TemplateFieldType;
        readonly description: "Full name of the client or customer being billed";
        readonly optional: true;
    }, {
        readonly name: "clientEmail";
        readonly type: TemplateFieldType;
        readonly description: "Email address of the client, if present";
        readonly optional: true;
    }, {
        readonly name: "clientAddress";
        readonly type: TemplateFieldType;
        readonly description: "Full mailing address of the client";
        readonly optional: true;
    }, {
        readonly name: "clientTaxId";
        readonly type: TemplateFieldType;
        readonly description: "Client's tax identification number. Omit if not present.";
        readonly optional: true;
    }, {
        readonly name: "lineItems";
        readonly type: TemplateFieldType;
        readonly description: "All line items found in the invoice";
        readonly optional: true;
        readonly fields: readonly [{
            readonly name: "description";
            readonly type: TemplateFieldType;
            readonly description: "Name or description of the product or service";
            readonly optional: true;
        }, {
            readonly name: "quantity";
            readonly type: TemplateFieldType;
            readonly description: "The quantity of units";
            readonly optional: true;
        }, {
            readonly name: "unitPrice";
            readonly type: TemplateFieldType;
            readonly description: "Price per unit as a plain number, no currency symbol";
            readonly optional: true;
        }, {
            readonly name: "taxRate";
            readonly type: TemplateFieldType;
            readonly description: "Tax rate for this line item as a percentage (e.g. 18 for 18%)";
            readonly optional: true;
        }, {
            readonly name: "tax";
            readonly type: TemplateFieldType;
            readonly description: "Tax amount for this line item as a plain number";
            readonly optional: true;
        }, {
            readonly name: "discount";
            readonly type: TemplateFieldType;
            readonly description: "Discount applied to this line item as a plain number";
            readonly optional: true;
        }, {
            readonly name: "total";
            readonly type: TemplateFieldType;
            readonly description: "Total for this line item including tax, after discount, as a plain number";
            readonly optional: true;
        }];
    }, {
        readonly name: "subtotal";
        readonly type: TemplateFieldType;
        readonly description: "Sum of all line items before tax or discounts, as a plain number";
        readonly optional: true;
    }, {
        readonly name: "taxRate";
        readonly type: TemplateFieldType;
        readonly description: "Overall tax rate as a percentage (e.g. 18 for 18%). Omit if not stated.";
        readonly optional: true;
    }, {
        readonly name: "taxAmount";
        readonly type: TemplateFieldType;
        readonly description: "Total tax amount applied to the invoice as a plain number";
        readonly optional: true;
    }, {
        readonly name: "discountAmount";
        readonly type: TemplateFieldType;
        readonly description: "Total discount applied as a plain number";
        readonly optional: true;
    }, {
        readonly name: "totalAmount";
        readonly type: TemplateFieldType;
        readonly description: "Final total amount due including tax and after discounts, as a plain number";
    }, {
        readonly name: "currency";
        readonly type: TemplateFieldType;
        readonly description: "ISO 4217 currency code";
    }, {
        readonly name: "paymentMethod";
        readonly type: TemplateFieldType;
        readonly description: "Payment method used or specified on the invoice. Omit if not mentioned.";
        readonly optional: true;
        readonly enum: readonly ["cash", "check", "credit_card", "debit_card", "paypal", "bank_transfer", "upi", "other"];
    }, {
        readonly name: "paymentLast4Digit";
        readonly type: TemplateFieldType;
        readonly description: "Last 4 digits of the card or account used for payment. Omit if not present.";
        readonly optional: true;
    }, {
        readonly name: "documentType";
        readonly type: TemplateFieldType;
        readonly description: "The type of document detected.";
        readonly enum: readonly ["invoice", "receipt"];
    }, {
        readonly name: "billingFrequency";
        readonly type: TemplateFieldType;
        readonly description: "How often the subscription is billed. Only populate if documentType is subscription or the document mentions recurring billing. Omit otherwise.";
        readonly optional: true;
        readonly enum: readonly ["daily", "weekly", "monthly", "quarterly", "yearly"];
    }, {
        readonly name: "nextBillingDate";
        readonly type: TemplateFieldType;
        readonly description: "The next scheduled billing or renewal date in ISO 8601 format (YYYY-MM-DD). Omit if not present.";
        readonly optional: true;
    }, {
        readonly name: "summary";
        readonly type: TemplateFieldType;
        readonly description: "A concise 5–8 word human-readable summary describing vendor and purpose (e.g. 'Vi postpaid mobile bill payment', 'Monthly subscription payment for Adobe').";
        readonly optional: true;
    }];
};

interface CleanPage {
    page: number;
    lines: string[];
    tables: string[][][];
    forms: Record<string, string>;
}
interface CleanedTextractOutput {
    totalPages: number;
    pages: CleanPage[];
    /** Flat readable text used as Gemini prompt input */
    text: string;
}

declare const DocAIErrorCode: {
    readonly PDF_EMPTY: "PDF_EMPTY";
    readonly PDF_TOO_LARGE: "PDF_TOO_LARGE";
    readonly PDF_PASSWORD_PROTECTED: "PDF_PASSWORD_PROTECTED";
    readonly PDF_CORRUPTED: "PDF_CORRUPTED";
    readonly PDF_NO_PAGES: "PDF_NO_PAGES";
    readonly PDF_UNSUPPORTED_FORMAT: "PDF_UNSUPPORTED_FORMAT";
    readonly TEXTRACT_UNSUPPORTED: "TEXTRACT_UNSUPPORTED";
    readonly TEXTRACT_THROTTLED: "TEXTRACT_THROTTLED";
    readonly TEXTRACT_FAILED: "TEXTRACT_FAILED";
    readonly GEMINI_FAILED: "GEMINI_FAILED";
    readonly GEMINI_QUOTA_EXCEEDED: "GEMINI_QUOTA_EXCEEDED";
    readonly EXTRACTION_FAILED: "EXTRACTION_FAILED";
    readonly REQUIRED_FIELDS_MISSING: "REQUIRED_FIELDS_MISSING";
};
type DocAIErrorCode = typeof DocAIErrorCode[keyof typeof DocAIErrorCode];
declare class DocAIError extends Error {
    readonly code: DocAIErrorCode;
    readonly description: string;
    readonly missingFields?: string[];
    readonly cause?: unknown;
    constructor({ code, missingFields, cause, message, }: {
        code: DocAIErrorCode;
        missingFields?: string[];
        cause?: unknown;
        message?: string;
    });
}

interface TextractConfig {
    region: string;
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
    };
}
interface VertexConfig {
    projectId: string;
    location?: string;
    credentials: Record<string, string> | string;
}
interface SnappinDocAIConfig {
    vertex: VertexConfig;
    textract: TextractConfig;
}
interface ExtractionOptions<T extends DocumentTemplate = typeof invoiceTemplate> {
    template?: T;
    featureTypes?: ("TABLES" | "FORMS" | "SIGNATURES" | "LAYOUT")[];
}
interface ExtractionOutput<TData = Record<string, unknown>> {
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
declare class SnappinDocAI {
    protected readonly textractClient: TextractClient;
    protected readonly google: ReturnType<typeof createVertex>;
    constructor({ vertex, textract }: SnappinDocAIConfig);
    extract<T extends DocumentTemplate = typeof invoiceTemplate>(buffer: Buffer | Uint8Array, options?: ExtractionOptions<T>): Promise<ExtractionOutput<InferTemplate<T>>>;
    /** Returns field names that are missing or empty across ALL data entries */
    private _getMissingFields;
    private _getPageCount;
    private _runTextract;
}

export { type CleanedTextractOutput, DocAIError, DocAIErrorCode, type DocumentTemplate, type ExtractionOptions, type ExtractionOutput, SnappinDocAI, type SnappinDocAIConfig, type TemplateField, type TemplateFieldType, type TextractConfig, type VertexConfig, invoiceTemplate };
