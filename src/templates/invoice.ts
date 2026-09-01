import { z } from "zod";

export const ZInvoiceLineItem = z.object({
    description: z.string().nullable().optional().describe("Name or description of the product or service"),
    quantity: z.number().optional().describe("Quantity of units for this line item"),
    unitPrice: z.number().optional().describe("Price per unit."),
    taxRate: z.number().optional().describe("Tax rate as a percentage for this line item (e.g. 18 for 18%). Omit if not stated."),
    tax: z.number().optional().describe("Tax amount for this line item in minor units."),
    discount: z.number().optional().describe("Discount applied to this line item."),
    total: z.number().optional().describe("Total amount for this line item after tax and discount."),
});

export const ZInvoiceData = z.object({
    // Required
    invoiceId: z.string().describe("The invoice number or id, reference ID, or document number"),
    invoiceDate: z.string().describe("The date the invoice was issued, in ISO 8601 format (YYYY-MM-DD)"),
    vendorName: z.string().describe("Full legal name of the company or individual issuing the invoice"),
    totalAmount: z.number().describe("Final total amount due including tax and after discounts."),
    currency: z.string().describe("Return ISO 4217 currency code only (e.g., USD, INR, EUR)"),
    documentType: z.enum(["invoice", "receipt"]).describe("The type of document detected"),

    // Optional — dates
    dueDate: z.string().optional().describe("Payment due date in ISO 8601 format (YYYY-MM-DD). Omit if not present."),
    nextBillingDate: z.string().optional().describe("The next scheduled billing or renewal date in ISO 8601 format (YYYY-MM-DD). Omit if not present."),

    // Optional — payment
    paymentStatus: z.enum(["paid", "unpaid", "partial", "refunded"]).optional().describe("Current status of the invoice if mentioned. Omit if not stated."),
    paymentTerms: z.string().optional().describe("Payment terms as stated on the invoice. Omit if not present."),
    paymentMethod: z.enum(["cash", "check", "credit_card", "debit_card", "paypal", "bank_transfer", "upi", "other"]).optional().describe("Payment method used or specified on the invoice. Omit if not mentioned."),
    paymentLast4Digits: z.string().optional().describe("Last 4 digits of the card or account used for payment. Omit if not present."),

    // Optional — vendor
    vendorStreetAddress: z.string().optional().describe("Street address of the vendor/seller. Omit city, state and country."),
    vendorCity: z.string().optional().describe("City of the vendor/seller. Omit state and country."),
    vendorState: z.string().optional().describe("State or province of the vendor/seller. Omit city and country."),
    vendorPostalCode: z.string().optional().describe("Postal or ZIP code of the vendor/seller.."),
    vendorCountry: z.string().optional().describe("Country of the vendor/seller."),
    vendorAddress: z.string().optional().describe("Full mailing address of the vendor/seller"),
    vendorEmail: z.string().optional().describe("Email address of the vendor, if present"),
    vendorWebsite: z.string().optional().describe("Website URL of the vendor, if present"),
    vendorPhone: z.string().optional().describe("Phone number of the vendor, if present"),
    vendorTaxId: z.string().optional().describe("Vendor's tax identification number. Omit if not present."),
    vendorRegId: z.string().optional().describe("Vendor's business registration number. Omit if not present."),

    // Optional — client
    clientName: z.string().optional().describe("Full name of the client or customer being billed"),
    clientEmail: z.string().optional().describe("Email address of the client, if present"),
    clientAddress: z.string().optional().describe("Full mailing address of the client"),
    clientTaxId: z.string().optional().describe("Client's tax identification number. Omit if not present."),

    // Optional — totals
    subtotal: z.number().optional().describe("Sum of all line items before tax or discounts."),
    taxRate: z.number().optional().describe("Overall tax rate as a percentage (e.g. 18 for 18%). Omit if not stated."),
    taxAmount: z.number().optional().describe("Total tax amount applied to the invoice."),
    discountAmount: z.number().optional().describe("Total discount applied."),

    // Optional — subscription
    billingFrequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).optional().describe("How often the subscription is billed. Only populate if document mentions recurring billing. Omit otherwise."),

    // Optional — misc
    summary: z.string().optional().describe("A concise 5-8 word human-readable summary describing vendor and purpose"),
    lineItems: z.array(ZInvoiceLineItem).optional().describe("All line items found in the invoice"),

    // pages: z.array(z.number()).optional().describe("Page numbers where this invoice appears (1-indexed). Example: [1, 2] means pages 1 and 2"),
});

const BAD = new Set(["null", "undefined", "unknown", "missing", "n/a", "none", "-", "--", "not found", "not available", ""])

function cleanNullStrings<T>(obj: T): T {
    if (typeof obj === "string") {
        return (BAD.has(obj.trim().toLowerCase()) ? null : obj) as T
    }
    if (Array.isArray(obj)) {
        return obj.map(cleanNullStrings) as T
    }
    if (obj !== null && typeof obj === "object") {
        return Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [k, cleanNullStrings(v)])
        ) as T
    }
    return obj
}

export const ZExtractionOutput = z.object({
    totalPages: z.number(),
    totalInvoices: z.number(),
    data: z.array(ZInvoiceData),
}).transform(output => cleanNullStrings(output))


export type InvoiceData = z.infer<typeof ZInvoiceData>;
export type InvoiceLineItem = z.infer<typeof ZInvoiceLineItem>;
export type ExtractionOutput = z.infer<typeof ZExtractionOutput>;