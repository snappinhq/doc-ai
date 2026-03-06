import { z } from "zod";

export const ZInvoiceLineItem = z.object({
    description: z.string().optional(),
    quantity:    z.number().optional(),
    unitPrice:   z.number().optional(),
    taxRate:     z.number().optional(),
    tax:         z.number().optional(),
    discount:    z.number().optional(),
    total:       z.number().optional(),
});

export const ZInvoiceData = z.object({
    // Required
    invoiceId:          z.string().describe("The invoice number or id, reference ID, or document number"),
    invoiceDate:        z.string().describe("The date the invoice was issued, in ISO 8601 format (YYYY-MM-DD)"),
    vendorName:         z.string().describe("Full legal name of the company or individual issuing the invoice"),
    totalAmount:        z.number().describe("Final total amount due including tax and after discounts, as a plain number"),
    currency:           z.string().describe("ISO 4217 currency code. Never return symbols. Only the 3-letter code"),
    documentType:       z.enum(["invoice", "receipt"]).describe("The type of document detected"),

    // Optional — dates
    dueDate:            z.string().optional().describe("Payment due date in ISO 8601 format (YYYY-MM-DD). Omit if not present."),
    nextBillingDate:    z.string().optional().describe("The next scheduled billing or renewal date in ISO 8601 format (YYYY-MM-DD). Omit if not present."),

    // Optional — payment
    paymentStatus:      z.enum(["paid", "unpaid", "partial", "refunded"]).optional().describe("Current status of the invoice if mentioned. Omit if not stated."),
    paymentTerms:       z.string().optional().describe("Payment terms as stated on the invoice. Omit if not present."),
    paymentMethod:      z.enum(["cash", "check", "credit_card", "debit_card", "paypal", "bank_transfer", "upi", "other"]).optional().describe("Payment method used or specified on the invoice. Omit if not mentioned."),
    paymentLast4Digits: z.string().optional().describe("Last 4 digits of the card or account used for payment. Omit if not present."),

    // Optional — vendor
    vendorAddress:      z.string().optional().describe("Full mailing address of the vendor/seller"),
    vendorEmail:        z.string().optional().describe("Email address of the vendor, if present"),
    vendorWebsite:      z.string().optional().describe("Website URL of the vendor, if present"),
    vendorPhone:        z.string().optional().describe("Phone number of the vendor, if present"),
    vendorTaxId:        z.string().optional().describe("Vendor's tax identification number. Omit if not present."),
    vendorRegId:        z.string().optional().describe("Vendor's business registration number. Omit if not present."),

    // Optional — client
    clientName:         z.string().optional().describe("Full name of the client or customer being billed"),
    clientEmail:        z.string().optional().describe("Email address of the client, if present"),
    clientAddress:      z.string().optional().describe("Full mailing address of the client"),
    clientTaxId:        z.string().optional().describe("Client's tax identification number. Omit if not present."),

    // Optional — totals
    subtotal:           z.number().optional().describe("Sum of all line items before tax or discounts, as a plain number"),
    taxRate:            z.number().optional().describe("Overall tax rate as a percentage (e.g. 18 for 18%). Omit if not stated."),
    taxAmount:          z.number().optional().describe("Total tax amount applied to the invoice as a plain number"),
    discountAmount:     z.number().optional().describe("Total discount applied as a plain number"),

    // Optional — subscription
    billingFrequency:   z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).optional().describe("How often the subscription is billed. Only populate if document mentions recurring billing. Omit otherwise."),

    // Optional — misc
    summary:            z.string().optional().describe("A concise 5-8 word human-readable summary describing vendor and purpose"),
    lineItems:          z.array(ZInvoiceLineItem).optional().describe("All line items found in the invoice"),
});

export const ZExtractionOutput = z.object({
    totalPages:    z.number().describe("Total number of pages in the PDF document"),
    totalInvoices: z.number().describe("Total number of individual invoices detected across all pages"),
    data:          z.array(ZInvoiceData).describe("One entry per detected invoice in document order"),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceData       = z.infer<typeof ZInvoiceData>;
export type InvoiceLineItem   = z.infer<typeof ZInvoiceLineItem>;
export type ExtractionOutput  = z.infer<typeof ZExtractionOutput>;