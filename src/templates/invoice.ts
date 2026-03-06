import type { DocumentTemplate, TemplateFieldType } from "../lib/template.engine";
import type { InferTemplate } from "../lib/template.engine";

export const invoiceTemplate = {
  name: "invoice",
  description: "Standard invoice data extraction template",
  fields: [
    {
      name: "invoiceId",
      type: "string" as TemplateFieldType,
      description: "The invoice number or id, reference ID, or document number",
    },
    {
      name: "invoiceDate",
      type: "date" as TemplateFieldType,
      description: "The date the invoice was issued, in ISO 8601 format (YYYY-MM-DD)",
    },
    {
      name: "dueDate",
      type: "date" as TemplateFieldType,
      description: "Payment due date in ISO 8601 format (YYYY-MM-DD). Omit if not present.",
      optional: true as const,
    },
    {
      name: "paymentStatus",
      type: "string" as TemplateFieldType,
      description: "Current status of the invoice if mentioned. Omit if not stated.",
      optional: true as const,
      enum: ["paid", "unpaid", "partial", "refunded", "unknown"] as const,
    },
    {
      name: "paymentTerms",
      type: "string" as TemplateFieldType,
      description: "Payment terms as stated on the invoice. Omit if not present.",
      optional: true as const,
    },
    {
      name: "vendorName",
      type: "string" as TemplateFieldType,
      description: "Full legal name of the company or individual issuing the invoice",
    },
    {
      name: "vendorAddress",
      type: "string" as TemplateFieldType,
      description: "Full mailing address of the vendor/seller",
      optional: true as const,
    },
    {
      name: "vendorEmail",
      type: "string" as TemplateFieldType,
      description: "Email address of the vendor, if present",
      optional: true as const,
    },
    {
      name: "vendorWebsite",
      type: "string" as TemplateFieldType,
      description: "Website URL of the vendor, if present",
      optional: true as const,
    },
    {
      name: "vendorPhone",
      type: "string" as TemplateFieldType,
      description: "Phone number of the vendor, if present",
      optional: true as const,
    },
    {
      name: "vendorTaxId",
      type: "string" as TemplateFieldType,
      description: "Vendor's tax identification number. Omit if not present.",
      optional: true as const,
    },
    {
      name: "vendorRegId",
      type: "string" as TemplateFieldType,
      description: "Vendor's business registration number. Omit if not present.",
      optional: true as const,
    },
    {
      name: "clientName",
      type: "string" as TemplateFieldType,
      description: "Full name of the client or customer being billed",
      optional: true as const,
    },
    {
      name: "clientEmail",
      type: "string" as TemplateFieldType,
      description: "Email address of the client, if present",
      optional: true as const,
    },
    {
      name: "clientAddress",
      type: "string" as TemplateFieldType,
      description: "Full mailing address of the client",
      optional: true as const,
    },
    {
      name: "clientTaxId",
      type: "string" as TemplateFieldType,
      description: "Client's tax identification number. Omit if not present.",
      optional: true as const,
    },
    {
      name: "lineItems",
      type: "object[]" as TemplateFieldType,
      description: "All line items found in the invoice",
      optional: true as const,
      fields: [
        {
          name: "description",
          type: "string" as TemplateFieldType,
          description: "Name or description of the product or service",
          optional: true as const,
        },
        {
          name: "quantity",
          type: "number" as TemplateFieldType,
          description: "The quantity of units",
          optional: true as const,
        },
        {
          name: "unitPrice",
          type: "number" as TemplateFieldType,
          description: "Price per unit as a plain number, no currency symbol",
          optional: true as const,
        },
        {
          name: "taxRate",
          type: "number" as TemplateFieldType,
          description: "Tax rate for this line item as a percentage (e.g. 18 for 18%)",
          optional: true as const,
        },
        {
          name: "tax",
          type: "number" as TemplateFieldType,
          description: "Tax amount for this line item as a plain number",
          optional: true as const,
        },
        {
          name: "discount",
          type: "number" as TemplateFieldType,
          description: "Discount applied to this line item as a plain number",
          optional: true as const,
        },
        {
          name: "total",
          type: "number" as TemplateFieldType,
          description: "Total for this line item including tax, after discount, as a plain number",
          optional: true as const,
        },
      ],
    },
    {
      name: "subtotal",
      type: "number" as TemplateFieldType,
      description: "Sum of all line items before tax or discounts, as a plain number",
      optional: true as const,
    },
    {
      name: "taxRate",
      type: "number" as TemplateFieldType,
      description: "Overall tax rate as a percentage (e.g. 18 for 18%). Omit if not stated.",
      optional: true as const,
    },
    {
      name: "taxAmount",
      type: "number" as TemplateFieldType,
      description: "Total tax amount applied to the invoice as a plain number",
      optional: true as const,
    },
    {
      name: "discountAmount",
      type: "number" as TemplateFieldType,
      description: "Total discount applied as a plain number",
      optional: true as const,
    },
    {
      name: "totalAmount",
      type: "number" as TemplateFieldType,
      description: "Final total amount due including tax and after discounts, as a plain number",
    },
    {
      name: "currency",
      type: "string" as TemplateFieldType,
      description: "ISO 4217 currency code. Never return symbols. Only the 3-letter code",
    },
    {
      name: "paymentMethod",
      type: "string" as TemplateFieldType,
      description: "Payment method used or specified on the invoice. Omit if not mentioned.",
      optional: true as const,
      enum: ["cash", "check", "credit_card", "debit_card", "paypal", "bank_transfer", "upi", "other"] as const,
    },
    {
      name: "paymentLast4Digits",
      type: "string" as TemplateFieldType,
      description: "Last 4 digits of the card or account used for payment. Omit if not present.",
      optional: true as const,
    },

    {
      name: "documentType",
      type: "string" as TemplateFieldType,
      description: "The type of document detected.",
      enum: ["invoice", "receipt"] as const,
    },

    {
      name: "billingFrequency",
      type: "string" as TemplateFieldType,
      description: "How often the subscription is billed. Only populate if documentType is subscription or the document mentions recurring billing. Omit otherwise.",
      optional: true as const,
      enum: ["daily", "weekly", "monthly", "quarterly", "yearly"] as const,
    },
    {
      name: "nextBillingDate",
      type: "date" as TemplateFieldType,
      description: "The next scheduled billing or renewal date in ISO 8601 format (YYYY-MM-DD). Omit if not present.",
      optional: true as const,
    },

    {
      name: "summary",
      type: "string" as TemplateFieldType,
      description:
        "A concise 5–8 word human-readable summary describing vendor and purpose (e.g. 'Vi postpaid mobile bill payment', 'Monthly subscription payment for Adobe').",
      optional: true as const,
    },
  ],
} as const satisfies DocumentTemplate;

/** Fully typed invoice output — use this in your application code */
export type InvoiceData = InferTemplate<typeof invoiceTemplate>;