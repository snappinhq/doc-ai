import { z } from 'zod';
import { TextractClient } from '@aws-sdk/client-textract';
import { createVertex } from '@ai-sdk/google-vertex';

declare const ZInvoiceLineItem: z.ZodObject<{
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    quantity: z.ZodOptional<z.ZodNumber>;
    unitPrice: z.ZodOptional<z.ZodNumber>;
    taxRate: z.ZodOptional<z.ZodNumber>;
    tax: z.ZodOptional<z.ZodNumber>;
    discount: z.ZodOptional<z.ZodNumber>;
    total: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    taxRate?: number | undefined;
    description?: string | null | undefined;
    quantity?: number | undefined;
    unitPrice?: number | undefined;
    tax?: number | undefined;
    discount?: number | undefined;
    total?: number | undefined;
}, {
    taxRate?: number | undefined;
    description?: string | null | undefined;
    quantity?: number | undefined;
    unitPrice?: number | undefined;
    tax?: number | undefined;
    discount?: number | undefined;
    total?: number | undefined;
}>;
declare const ZInvoiceData: z.ZodObject<{
    invoiceId: z.ZodString;
    invoiceDate: z.ZodString;
    vendorName: z.ZodString;
    totalAmount: z.ZodNumber;
    currency: z.ZodString;
    documentType: z.ZodEnum<["invoice", "receipt"]>;
    dueDate: z.ZodOptional<z.ZodString>;
    nextBillingDate: z.ZodOptional<z.ZodString>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["paid", "unpaid", "partial", "refunded"]>>;
    paymentTerms: z.ZodOptional<z.ZodString>;
    paymentMethod: z.ZodOptional<z.ZodEnum<["cash", "check", "credit_card", "debit_card", "paypal", "bank_transfer", "upi", "other"]>>;
    paymentLast4Digits: z.ZodOptional<z.ZodString>;
    vendorAddress: z.ZodOptional<z.ZodString>;
    vendorEmail: z.ZodOptional<z.ZodString>;
    vendorWebsite: z.ZodOptional<z.ZodString>;
    vendorPhone: z.ZodOptional<z.ZodString>;
    vendorTaxId: z.ZodOptional<z.ZodString>;
    vendorRegId: z.ZodOptional<z.ZodString>;
    clientName: z.ZodOptional<z.ZodString>;
    clientEmail: z.ZodOptional<z.ZodString>;
    clientAddress: z.ZodOptional<z.ZodString>;
    clientTaxId: z.ZodOptional<z.ZodString>;
    subtotal: z.ZodOptional<z.ZodNumber>;
    taxRate: z.ZodOptional<z.ZodNumber>;
    taxAmount: z.ZodOptional<z.ZodNumber>;
    discountAmount: z.ZodOptional<z.ZodNumber>;
    billingFrequency: z.ZodOptional<z.ZodEnum<["daily", "weekly", "monthly", "quarterly", "yearly"]>>;
    summary: z.ZodOptional<z.ZodString>;
    lineItems: z.ZodOptional<z.ZodArray<z.ZodObject<{
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        quantity: z.ZodOptional<z.ZodNumber>;
        unitPrice: z.ZodOptional<z.ZodNumber>;
        taxRate: z.ZodOptional<z.ZodNumber>;
        tax: z.ZodOptional<z.ZodNumber>;
        discount: z.ZodOptional<z.ZodNumber>;
        total: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        taxRate?: number | undefined;
        description?: string | null | undefined;
        quantity?: number | undefined;
        unitPrice?: number | undefined;
        tax?: number | undefined;
        discount?: number | undefined;
        total?: number | undefined;
    }, {
        taxRate?: number | undefined;
        description?: string | null | undefined;
        quantity?: number | undefined;
        unitPrice?: number | undefined;
        tax?: number | undefined;
        discount?: number | undefined;
        total?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    invoiceId: string;
    invoiceDate: string;
    vendorName: string;
    totalAmount: number;
    currency: string;
    documentType: "invoice" | "receipt";
    dueDate?: string | undefined;
    nextBillingDate?: string | undefined;
    paymentStatus?: "paid" | "unpaid" | "partial" | "refunded" | undefined;
    paymentTerms?: string | undefined;
    paymentMethod?: "cash" | "check" | "credit_card" | "debit_card" | "paypal" | "bank_transfer" | "upi" | "other" | undefined;
    paymentLast4Digits?: string | undefined;
    vendorAddress?: string | undefined;
    vendorEmail?: string | undefined;
    vendorWebsite?: string | undefined;
    vendorPhone?: string | undefined;
    vendorTaxId?: string | undefined;
    vendorRegId?: string | undefined;
    clientName?: string | undefined;
    clientEmail?: string | undefined;
    clientAddress?: string | undefined;
    clientTaxId?: string | undefined;
    subtotal?: number | undefined;
    taxRate?: number | undefined;
    taxAmount?: number | undefined;
    discountAmount?: number | undefined;
    billingFrequency?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | undefined;
    summary?: string | undefined;
    lineItems?: {
        taxRate?: number | undefined;
        description?: string | null | undefined;
        quantity?: number | undefined;
        unitPrice?: number | undefined;
        tax?: number | undefined;
        discount?: number | undefined;
        total?: number | undefined;
    }[] | undefined;
}, {
    invoiceId: string;
    invoiceDate: string;
    vendorName: string;
    totalAmount: number;
    currency: string;
    documentType: "invoice" | "receipt";
    dueDate?: string | undefined;
    nextBillingDate?: string | undefined;
    paymentStatus?: "paid" | "unpaid" | "partial" | "refunded" | undefined;
    paymentTerms?: string | undefined;
    paymentMethod?: "cash" | "check" | "credit_card" | "debit_card" | "paypal" | "bank_transfer" | "upi" | "other" | undefined;
    paymentLast4Digits?: string | undefined;
    vendorAddress?: string | undefined;
    vendorEmail?: string | undefined;
    vendorWebsite?: string | undefined;
    vendorPhone?: string | undefined;
    vendorTaxId?: string | undefined;
    vendorRegId?: string | undefined;
    clientName?: string | undefined;
    clientEmail?: string | undefined;
    clientAddress?: string | undefined;
    clientTaxId?: string | undefined;
    subtotal?: number | undefined;
    taxRate?: number | undefined;
    taxAmount?: number | undefined;
    discountAmount?: number | undefined;
    billingFrequency?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | undefined;
    summary?: string | undefined;
    lineItems?: {
        taxRate?: number | undefined;
        description?: string | null | undefined;
        quantity?: number | undefined;
        unitPrice?: number | undefined;
        tax?: number | undefined;
        discount?: number | undefined;
        total?: number | undefined;
    }[] | undefined;
}>;
declare const ZExtractionOutput: z.ZodEffects<z.ZodObject<{
    totalPages: z.ZodNumber;
    totalInvoices: z.ZodNumber;
    data: z.ZodArray<z.ZodObject<{
        invoiceId: z.ZodString;
        invoiceDate: z.ZodString;
        vendorName: z.ZodString;
        totalAmount: z.ZodNumber;
        currency: z.ZodString;
        documentType: z.ZodEnum<["invoice", "receipt"]>;
        dueDate: z.ZodOptional<z.ZodString>;
        nextBillingDate: z.ZodOptional<z.ZodString>;
        paymentStatus: z.ZodOptional<z.ZodEnum<["paid", "unpaid", "partial", "refunded"]>>;
        paymentTerms: z.ZodOptional<z.ZodString>;
        paymentMethod: z.ZodOptional<z.ZodEnum<["cash", "check", "credit_card", "debit_card", "paypal", "bank_transfer", "upi", "other"]>>;
        paymentLast4Digits: z.ZodOptional<z.ZodString>;
        vendorAddress: z.ZodOptional<z.ZodString>;
        vendorEmail: z.ZodOptional<z.ZodString>;
        vendorWebsite: z.ZodOptional<z.ZodString>;
        vendorPhone: z.ZodOptional<z.ZodString>;
        vendorTaxId: z.ZodOptional<z.ZodString>;
        vendorRegId: z.ZodOptional<z.ZodString>;
        clientName: z.ZodOptional<z.ZodString>;
        clientEmail: z.ZodOptional<z.ZodString>;
        clientAddress: z.ZodOptional<z.ZodString>;
        clientTaxId: z.ZodOptional<z.ZodString>;
        subtotal: z.ZodOptional<z.ZodNumber>;
        taxRate: z.ZodOptional<z.ZodNumber>;
        taxAmount: z.ZodOptional<z.ZodNumber>;
        discountAmount: z.ZodOptional<z.ZodNumber>;
        billingFrequency: z.ZodOptional<z.ZodEnum<["daily", "weekly", "monthly", "quarterly", "yearly"]>>;
        summary: z.ZodOptional<z.ZodString>;
        lineItems: z.ZodOptional<z.ZodArray<z.ZodObject<{
            description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            quantity: z.ZodOptional<z.ZodNumber>;
            unitPrice: z.ZodOptional<z.ZodNumber>;
            taxRate: z.ZodOptional<z.ZodNumber>;
            tax: z.ZodOptional<z.ZodNumber>;
            discount: z.ZodOptional<z.ZodNumber>;
            total: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            taxRate?: number | undefined;
            description?: string | null | undefined;
            quantity?: number | undefined;
            unitPrice?: number | undefined;
            tax?: number | undefined;
            discount?: number | undefined;
            total?: number | undefined;
        }, {
            taxRate?: number | undefined;
            description?: string | null | undefined;
            quantity?: number | undefined;
            unitPrice?: number | undefined;
            tax?: number | undefined;
            discount?: number | undefined;
            total?: number | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        invoiceId: string;
        invoiceDate: string;
        vendorName: string;
        totalAmount: number;
        currency: string;
        documentType: "invoice" | "receipt";
        dueDate?: string | undefined;
        nextBillingDate?: string | undefined;
        paymentStatus?: "paid" | "unpaid" | "partial" | "refunded" | undefined;
        paymentTerms?: string | undefined;
        paymentMethod?: "cash" | "check" | "credit_card" | "debit_card" | "paypal" | "bank_transfer" | "upi" | "other" | undefined;
        paymentLast4Digits?: string | undefined;
        vendorAddress?: string | undefined;
        vendorEmail?: string | undefined;
        vendorWebsite?: string | undefined;
        vendorPhone?: string | undefined;
        vendorTaxId?: string | undefined;
        vendorRegId?: string | undefined;
        clientName?: string | undefined;
        clientEmail?: string | undefined;
        clientAddress?: string | undefined;
        clientTaxId?: string | undefined;
        subtotal?: number | undefined;
        taxRate?: number | undefined;
        taxAmount?: number | undefined;
        discountAmount?: number | undefined;
        billingFrequency?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | undefined;
        summary?: string | undefined;
        lineItems?: {
            taxRate?: number | undefined;
            description?: string | null | undefined;
            quantity?: number | undefined;
            unitPrice?: number | undefined;
            tax?: number | undefined;
            discount?: number | undefined;
            total?: number | undefined;
        }[] | undefined;
    }, {
        invoiceId: string;
        invoiceDate: string;
        vendorName: string;
        totalAmount: number;
        currency: string;
        documentType: "invoice" | "receipt";
        dueDate?: string | undefined;
        nextBillingDate?: string | undefined;
        paymentStatus?: "paid" | "unpaid" | "partial" | "refunded" | undefined;
        paymentTerms?: string | undefined;
        paymentMethod?: "cash" | "check" | "credit_card" | "debit_card" | "paypal" | "bank_transfer" | "upi" | "other" | undefined;
        paymentLast4Digits?: string | undefined;
        vendorAddress?: string | undefined;
        vendorEmail?: string | undefined;
        vendorWebsite?: string | undefined;
        vendorPhone?: string | undefined;
        vendorTaxId?: string | undefined;
        vendorRegId?: string | undefined;
        clientName?: string | undefined;
        clientEmail?: string | undefined;
        clientAddress?: string | undefined;
        clientTaxId?: string | undefined;
        subtotal?: number | undefined;
        taxRate?: number | undefined;
        taxAmount?: number | undefined;
        discountAmount?: number | undefined;
        billingFrequency?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | undefined;
        summary?: string | undefined;
        lineItems?: {
            taxRate?: number | undefined;
            description?: string | null | undefined;
            quantity?: number | undefined;
            unitPrice?: number | undefined;
            tax?: number | undefined;
            discount?: number | undefined;
            total?: number | undefined;
        }[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    data: {
        invoiceId: string;
        invoiceDate: string;
        vendorName: string;
        totalAmount: number;
        currency: string;
        documentType: "invoice" | "receipt";
        dueDate?: string | undefined;
        nextBillingDate?: string | undefined;
        paymentStatus?: "paid" | "unpaid" | "partial" | "refunded" | undefined;
        paymentTerms?: string | undefined;
        paymentMethod?: "cash" | "check" | "credit_card" | "debit_card" | "paypal" | "bank_transfer" | "upi" | "other" | undefined;
        paymentLast4Digits?: string | undefined;
        vendorAddress?: string | undefined;
        vendorEmail?: string | undefined;
        vendorWebsite?: string | undefined;
        vendorPhone?: string | undefined;
        vendorTaxId?: string | undefined;
        vendorRegId?: string | undefined;
        clientName?: string | undefined;
        clientEmail?: string | undefined;
        clientAddress?: string | undefined;
        clientTaxId?: string | undefined;
        subtotal?: number | undefined;
        taxRate?: number | undefined;
        taxAmount?: number | undefined;
        discountAmount?: number | undefined;
        billingFrequency?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | undefined;
        summary?: string | undefined;
        lineItems?: {
            taxRate?: number | undefined;
            description?: string | null | undefined;
            quantity?: number | undefined;
            unitPrice?: number | undefined;
            tax?: number | undefined;
            discount?: number | undefined;
            total?: number | undefined;
        }[] | undefined;
    }[];
    totalPages: number;
    totalInvoices: number;
}, {
    data: {
        invoiceId: string;
        invoiceDate: string;
        vendorName: string;
        totalAmount: number;
        currency: string;
        documentType: "invoice" | "receipt";
        dueDate?: string | undefined;
        nextBillingDate?: string | undefined;
        paymentStatus?: "paid" | "unpaid" | "partial" | "refunded" | undefined;
        paymentTerms?: string | undefined;
        paymentMethod?: "cash" | "check" | "credit_card" | "debit_card" | "paypal" | "bank_transfer" | "upi" | "other" | undefined;
        paymentLast4Digits?: string | undefined;
        vendorAddress?: string | undefined;
        vendorEmail?: string | undefined;
        vendorWebsite?: string | undefined;
        vendorPhone?: string | undefined;
        vendorTaxId?: string | undefined;
        vendorRegId?: string | undefined;
        clientName?: string | undefined;
        clientEmail?: string | undefined;
        clientAddress?: string | undefined;
        clientTaxId?: string | undefined;
        subtotal?: number | undefined;
        taxRate?: number | undefined;
        taxAmount?: number | undefined;
        discountAmount?: number | undefined;
        billingFrequency?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | undefined;
        summary?: string | undefined;
        lineItems?: {
            taxRate?: number | undefined;
            description?: string | null | undefined;
            quantity?: number | undefined;
            unitPrice?: number | undefined;
            tax?: number | undefined;
            discount?: number | undefined;
            total?: number | undefined;
        }[] | undefined;
    }[];
    totalPages: number;
    totalInvoices: number;
}>, {
    data: {
        invoiceId: string;
        invoiceDate: string;
        vendorName: string;
        totalAmount: number;
        currency: string;
        documentType: "invoice" | "receipt";
        dueDate?: string | undefined;
        nextBillingDate?: string | undefined;
        paymentStatus?: "paid" | "unpaid" | "partial" | "refunded" | undefined;
        paymentTerms?: string | undefined;
        paymentMethod?: "cash" | "check" | "credit_card" | "debit_card" | "paypal" | "bank_transfer" | "upi" | "other" | undefined;
        paymentLast4Digits?: string | undefined;
        vendorAddress?: string | undefined;
        vendorEmail?: string | undefined;
        vendorWebsite?: string | undefined;
        vendorPhone?: string | undefined;
        vendorTaxId?: string | undefined;
        vendorRegId?: string | undefined;
        clientName?: string | undefined;
        clientEmail?: string | undefined;
        clientAddress?: string | undefined;
        clientTaxId?: string | undefined;
        subtotal?: number | undefined;
        taxRate?: number | undefined;
        taxAmount?: number | undefined;
        discountAmount?: number | undefined;
        billingFrequency?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | undefined;
        summary?: string | undefined;
        lineItems?: {
            taxRate?: number | undefined;
            description?: string | null | undefined;
            quantity?: number | undefined;
            unitPrice?: number | undefined;
            tax?: number | undefined;
            discount?: number | undefined;
            total?: number | undefined;
        }[] | undefined;
    }[];
    totalPages: number;
    totalInvoices: number;
}, {
    data: {
        invoiceId: string;
        invoiceDate: string;
        vendorName: string;
        totalAmount: number;
        currency: string;
        documentType: "invoice" | "receipt";
        dueDate?: string | undefined;
        nextBillingDate?: string | undefined;
        paymentStatus?: "paid" | "unpaid" | "partial" | "refunded" | undefined;
        paymentTerms?: string | undefined;
        paymentMethod?: "cash" | "check" | "credit_card" | "debit_card" | "paypal" | "bank_transfer" | "upi" | "other" | undefined;
        paymentLast4Digits?: string | undefined;
        vendorAddress?: string | undefined;
        vendorEmail?: string | undefined;
        vendorWebsite?: string | undefined;
        vendorPhone?: string | undefined;
        vendorTaxId?: string | undefined;
        vendorRegId?: string | undefined;
        clientName?: string | undefined;
        clientEmail?: string | undefined;
        clientAddress?: string | undefined;
        clientTaxId?: string | undefined;
        subtotal?: number | undefined;
        taxRate?: number | undefined;
        taxAmount?: number | undefined;
        discountAmount?: number | undefined;
        billingFrequency?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | undefined;
        summary?: string | undefined;
        lineItems?: {
            taxRate?: number | undefined;
            description?: string | null | undefined;
            quantity?: number | undefined;
            unitPrice?: number | undefined;
            tax?: number | undefined;
            discount?: number | undefined;
            total?: number | undefined;
        }[] | undefined;
    }[];
    totalPages: number;
    totalInvoices: number;
}>;
type InvoiceData = z.infer<typeof ZInvoiceData>;
type InvoiceLineItem = z.infer<typeof ZInvoiceLineItem>;

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
interface ExtractionOptions {
    featureTypes?: ("TABLES" | "FORMS" | "SIGNATURES" | "LAYOUT")[];
}
interface ExtractionResult {
    totalPages: number;
    totalInvoices: number;
    data: InvoiceData[];
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
    extract(buffer: Buffer | Uint8Array, options?: ExtractionOptions): Promise<ExtractionResult>;
    private _getMissingFields;
    private _runTextract;
}

export { type CleanedTextractOutput, DocAIError, DocAIErrorCode, type ExtractionOptions, type ExtractionResult, type InvoiceData, type InvoiceLineItem, SnappinDocAI, type SnappinDocAIConfig, type TextractConfig, type VertexConfig, ZExtractionOutput, ZInvoiceData, ZInvoiceLineItem };
