// src/index.ts
import {
  TextractClient,
  AnalyzeDocumentCommand
} from "@aws-sdk/client-textract";
import { createVertex } from "@ai-sdk/google-vertex";
import { generateText, Output } from "ai";
import { PDFDocument } from "pdf-lib";

// src/lib/textract.cleaner.ts
function cleanTextractOutput(blocks) {
  const blockMap = /* @__PURE__ */ new Map();
  for (const b of blocks) {
    if (b.Id) blockMap.set(b.Id, b);
  }
  const pageBlocks = blocks.filter((b) => b.BlockType === "PAGE");
  const totalPages = pageBlocks.length || 1;
  const pages = pageBlocks.map((pageBlock) => {
    const pageNum = pageBlock.Page ?? 1;
    const childIds = getChildIds(pageBlock);
    const lines = [];
    const tables = [];
    const forms = {};
    for (const childId of childIds) {
      const child = blockMap.get(childId);
      if (!child) continue;
      switch (child.BlockType) {
        case "LINE":
          if (child.Text) lines.push(child.Text);
          break;
        case "TABLE":
          extractTable(child, blockMap, tables);
          break;
        case "KEY_VALUE_SET":
          if (child.EntityTypes?.includes("KEY")) {
            const { key, value } = extractKVPair(child, blockMap);
            if (key) forms[key] = value;
          }
          break;
      }
    }
    return { page: pageNum, lines, tables, forms };
  });
  if (pages.length === 0) {
    const lines = blocks.filter((b) => b.BlockType === "LINE" && b.Text).map((b) => b.Text);
    pages.push({ page: 1, lines, tables: [], forms: {} });
  }
  return {
    totalPages,
    pages,
    text: renderCleanText(pages)
  };
}
function getChildIds(block) {
  return block.Relationships?.filter((r) => r.Type === "CHILD").flatMap((r) => r.Ids ?? []) ?? [];
}
function getCellText(cell, blockMap) {
  const wordIds = getChildIds(cell);
  return wordIds.map((id) => blockMap.get(id)).filter((b) => !!b && b.BlockType === "WORD").map((b) => b.Text ?? "").join(" ").trim();
}
function extractTable(tableBlock, blockMap, out) {
  const cellIds = getChildIds(tableBlock);
  const grid = /* @__PURE__ */ new Map();
  let maxRow = 0;
  let maxCol = 0;
  for (const cellId of cellIds) {
    const cell = blockMap.get(cellId);
    if (!cell || cell.BlockType !== "CELL") continue;
    const row = cell.RowIndex ?? 1;
    const col = cell.ColumnIndex ?? 1;
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
    grid.set(`${row},${col}`, getCellText(cell, blockMap));
  }
  const tableRows = [];
  for (let r = 1; r <= maxRow; r++) {
    const row = [];
    for (let c = 1; c <= maxCol; c++) {
      row.push(grid.get(`${r},${c}`) ?? "");
    }
    tableRows.push(row);
  }
  out.push(tableRows);
}
function extractKVPair(keyBlock, blockMap) {
  const keyWordIds = getChildIds(keyBlock);
  const key = keyWordIds.map((id) => blockMap.get(id)).filter((b) => !!b && b.BlockType === "WORD").map((b) => b.Text ?? "").join(" ").trim();
  const valueBlockId = keyBlock.Relationships?.find(
    (r) => r.Type === "VALUE"
  )?.Ids?.[0];
  let value = "";
  if (valueBlockId) {
    const valueBlock = blockMap.get(valueBlockId);
    if (valueBlock) {
      const valueWordIds = getChildIds(valueBlock);
      value = valueWordIds.map((id) => blockMap.get(id)).filter((b) => !!b && b.BlockType === "WORD").map((b) => b.Text ?? "").join(" ").trim();
    }
  }
  return { key, value };
}
function renderCleanText(pages) {
  return pages.map((p) => {
    const parts = [`=== PAGE ${p.page} ===`];
    if (p.lines.length) parts.push(p.lines.join("\n"));
    if (Object.keys(p.forms).length) {
      parts.push("\n[FORM FIELDS]");
      for (const [k, v] of Object.entries(p.forms)) {
        parts.push(`${k}: ${v}`);
      }
    }
    for (const table of p.tables) {
      parts.push("\n[TABLE]");
      for (const row of table) {
        parts.push(`| ${row.join(" | ")} |`);
      }
    }
    return parts.join("\n");
  }).join("\n\n");
}

// src/lib/template.engine.ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
function fieldToZod(field) {
  const base = (() => {
    if (field.enum && field.enum.length > 0) {
      return z.enum(field.enum);
    }
    switch (field.type) {
      case "string":
        return z.string();
      case "number":
        return z.number();
      case "boolean":
        return z.boolean();
      case "date":
        return z.string();
      // ISO date string
      case "string[]":
        return z.array(z.string());
      case "number[]":
        return z.array(z.number());
      case "object[]": {
        if (!field.fields?.length)
          throw new Error(`object[] field "${field.name}" must define nested fields`);
        const shape = {};
        for (const nested of field.fields) {
          shape[nested.name] = fieldToZod(nested);
        }
        return z.array(z.object(shape));
      }
      default:
        return z.string();
    }
  })();
  const described = base.describe(field.description);
  return field.optional ? described.optional() : described;
}
var TemplateEngine = class _TemplateEngine {
  static toZodSchema(template) {
    const shape = {};
    for (const field of template.fields) {
      shape[field.name] = fieldToZod(field);
    }
    return z.object(shape);
  }
  static toOutputSchema(template) {
    const itemSchema = _TemplateEngine.toZodSchema(template);
    const outputSchema = z.object({
      totalPages: z.number().describe("Total number of pages in the PDF document"),
      totalInvoices: z.number().describe("Total number of individual invoices detected across all pages"),
      data: z.array(itemSchema).describe("One entry per detected invoice in document order")
    });
    const jsonSchema = zodToJsonSchema(outputSchema, {
      name: template.name,
      errorMessages: true
    });
    return {
      zod: outputSchema,
      jsonSchema,
      jsonSchemaString: JSON.stringify(jsonSchema, null, 2)
    };
  }
};

// src/templates/invoice.ts
var invoiceTemplate = {
  name: "invoice",
  description: "Standard invoice data extraction template",
  fields: [
    {
      name: "invoiceNumber",
      type: "string",
      description: "The invoice number, reference ID, or document number"
    },
    {
      name: "invoiceDate",
      type: "date",
      description: "The date the invoice was issued, in ISO 8601 format (YYYY-MM-DD)"
    },
    {
      name: "dueDate",
      type: "date",
      description: "Payment due date in ISO 8601 format (YYYY-MM-DD). Omit if not present.",
      optional: true
    },
    {
      name: "invoiceStatus",
      type: "string",
      description: "Current status of the invoice if mentioned. Omit if not stated.",
      optional: true,
      enum: ["paid", "unpaid", "overdue", "draft", "cancelled", "partial"]
    },
    {
      name: "paymentTerms",
      type: "string",
      description: "Payment terms as stated on the invoice. Omit if not present.",
      optional: true
    },
    {
      name: "vendorName",
      type: "string",
      description: "Full legal name of the company or individual issuing the invoice"
    },
    {
      name: "vendorAddress",
      type: "string",
      description: "Full mailing address of the vendor/seller",
      optional: true
    },
    {
      name: "vendorEmail",
      type: "string",
      description: "Email address of the vendor, if present",
      optional: true
    },
    {
      name: "vendorWebsite",
      type: "string",
      description: "Website URL of the vendor, if present",
      optional: true
    },
    {
      name: "vendorPhone",
      type: "string",
      description: "Phone number of the vendor, if present",
      optional: true
    },
    {
      name: "vendorTaxId",
      type: "string",
      description: "Vendor's tax identification number. Omit if not present.",
      optional: true
    },
    {
      name: "vendorRegId",
      type: "string",
      description: "Vendor's business registration number. Omit if not present.",
      optional: true
    },
    {
      name: "clientName",
      type: "string",
      description: "Full name of the client or customer being billed",
      optional: true
    },
    {
      name: "clientEmail",
      type: "string",
      description: "Email address of the client, if present",
      optional: true
    },
    {
      name: "clientAddress",
      type: "string",
      description: "Full mailing address of the client",
      optional: true
    },
    {
      name: "clientTaxId",
      type: "string",
      description: "Client's tax identification number. Omit if not present.",
      optional: true
    },
    {
      name: "lineItems",
      type: "object[]",
      description: "All line items found in the invoice",
      optional: true,
      fields: [
        {
          name: "description",
          type: "string",
          description: "Name or description of the product or service",
          optional: true
        },
        {
          name: "quantity",
          type: "number",
          description: "The quantity of units",
          optional: true
        },
        {
          name: "unitPrice",
          type: "number",
          description: "Price per unit as a plain number, no currency symbol",
          optional: true
        },
        {
          name: "taxRate",
          type: "number",
          description: "Tax rate for this line item as a percentage (e.g. 18 for 18%)",
          optional: true
        },
        {
          name: "tax",
          type: "number",
          description: "Tax amount for this line item as a plain number",
          optional: true
        },
        {
          name: "discount",
          type: "number",
          description: "Discount applied to this line item as a plain number",
          optional: true
        },
        {
          name: "total",
          type: "number",
          description: "Total for this line item including tax, after discount, as a plain number",
          optional: true
        }
      ]
    },
    {
      name: "subtotal",
      type: "number",
      description: "Sum of all line items before tax or discounts, as a plain number",
      optional: true
    },
    {
      name: "taxRate",
      type: "number",
      description: "Overall tax rate as a percentage (e.g. 18 for 18%). Omit if not stated.",
      optional: true
    },
    {
      name: "taxAmount",
      type: "number",
      description: "Total tax amount applied to the invoice as a plain number",
      optional: true
    },
    {
      name: "discountAmount",
      type: "number",
      description: "Total discount applied as a plain number",
      optional: true
    },
    {
      name: "totalAmount",
      type: "number",
      description: "Final total amount due including tax and after discounts, as a plain number"
    },
    {
      name: "currency",
      type: "string",
      description: "ISO 4217 currency code"
    },
    {
      name: "paymentMethod",
      type: "string",
      description: "Payment method used or specified on the invoice. Omit if not mentioned.",
      optional: true,
      enum: ["cash", "check", "credit_card", "debit_card", "paypal", "bank_transfer", "upi", "other"]
    },
    {
      name: "paymentLast4Digit",
      type: "string",
      description: "Last 4 digits of the card or account used for payment. Omit if not present.",
      optional: true
    },
    {
      name: "documentType",
      type: "string",
      description: "The type of document detected.",
      enum: ["invoice", "receipt"]
    },
    {
      name: "billingFrequency",
      type: "string",
      description: "How often the subscription is billed. Only populate if documentType is subscription or the document mentions recurring billing. Omit otherwise.",
      optional: true,
      enum: ["daily", "weekly", "monthly", "quarterly", "yearly"]
    },
    {
      name: "nextBillingDate",
      type: "date",
      description: "The next scheduled billing or renewal date in ISO 8601 format (YYYY-MM-DD). Omit if not present.",
      optional: true
    },
    {
      name: "summary",
      type: "string",
      description: "A concise 5\u20138 word human-readable summary describing vendor and purpose (e.g. 'Vi postpaid mobile bill payment', 'Monthly subscription payment for Adobe').",
      optional: true
    }
  ]
};

// src/prompt.ts
var BASE_EXTRACTION_PROMPT = `
You are an expert in structured data extraction. Your task is to extract information from unstructured content and transform it into the specified structure. Follow these rules strictly:

1. Handle Missing or Undetermined Data:
- If any field's information is missing, unknown, or cannot be determined, return its value as null.
- **Do not use substitutes such as "unknown," "missing," or any other placeholder for missing or unknown data. The value **must** always be explicitly null.
-There may be multiple invoices in a single PDF \u2014 detect each one separately
`;

// src/lib/parseCredentials.ts
function parseCredentials(credentials) {
  if (typeof credentials === "object") return credentials;
  try {
    const decoded = Buffer.from(credentials, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    try {
      return JSON.parse(credentials);
    } catch {
      throw new Error(
        "Invalid credentials: must be a JSON object, JSON string, or base64-encoded JSON string"
      );
    }
  }
}

// src/errors.ts
var DocAIErrorCode = {
  // PDF errors
  PDF_EMPTY: "PDF_EMPTY",
  PDF_TOO_LARGE: "PDF_TOO_LARGE",
  PDF_PASSWORD_PROTECTED: "PDF_PASSWORD_PROTECTED",
  PDF_CORRUPTED: "PDF_CORRUPTED",
  PDF_NO_PAGES: "PDF_NO_PAGES",
  PDF_UNSUPPORTED_FORMAT: "PDF_UNSUPPORTED_FORMAT",
  // Textract errors
  TEXTRACT_UNSUPPORTED: "TEXTRACT_UNSUPPORTED",
  TEXTRACT_THROTTLED: "TEXTRACT_THROTTLED",
  TEXTRACT_FAILED: "TEXTRACT_FAILED",
  // Gemini errors
  GEMINI_FAILED: "GEMINI_FAILED",
  GEMINI_QUOTA_EXCEEDED: "GEMINI_QUOTA_EXCEEDED",
  // Extraction errors
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  REQUIRED_FIELDS_MISSING: "REQUIRED_FIELDS_MISSING"
};
var ERROR_DESCRIPTIONS = {
  PDF_EMPTY: "The provided buffer is empty or has no content.",
  PDF_TOO_LARGE: "PDF exceeds the maximum allowed size of 10MB.",
  PDF_PASSWORD_PROTECTED: "The PDF is password-protected and cannot be processed.",
  PDF_CORRUPTED: "The PDF file appears to be corrupted or is not a valid PDF.",
  PDF_NO_PAGES: "The PDF contains no pages.",
  PDF_UNSUPPORTED_FORMAT: "The file format is not supported. Only PDF files are accepted.",
  TEXTRACT_UNSUPPORTED: "AWS Textract could not process this document format.",
  TEXTRACT_THROTTLED: "AWS Textract request was throttled. Please retry after a moment.",
  TEXTRACT_FAILED: "AWS Textract failed to analyze the document.",
  GEMINI_FAILED: "Gemini failed to process or normalize the extracted content.",
  GEMINI_QUOTA_EXCEEDED: "Gemini API quota exceeded. Please retry later.",
  EXTRACTION_FAILED: "Both extraction stages failed to produce a valid result.",
  REQUIRED_FIELDS_MISSING: "One or more required fields could not be extracted from the document."
};
var DocAIError = class extends Error {
  code;
  description;
  missingFields;
  cause;
  constructor({
    code,
    missingFields,
    cause,
    message
  }) {
    const description = ERROR_DESCRIPTIONS[code];
    super(message ?? description);
    this.name = "DocAIError";
    this.code = code;
    this.description = description;
    this.missingFields = missingFields;
    this.cause = cause;
  }
};
var MAX_PDF_SIZE = 10 * 1024 * 1024;
function validateBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new DocAIError({ code: DocAIErrorCode.PDF_EMPTY });
  }
  if (buffer.length > MAX_PDF_SIZE) {
    throw new DocAIError({ code: DocAIErrorCode.PDF_TOO_LARGE });
  }
  if (buffer[0] !== 37 || // %
  buffer[1] !== 80 || // P
  buffer[2] !== 68 || // D
  buffer[3] !== 70) {
    throw new DocAIError({ code: DocAIErrorCode.PDF_UNSUPPORTED_FORMAT });
  }
}
function remapPdfError(err) {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("encrypted") || msg.includes("password")) {
    throw new DocAIError({ code: DocAIErrorCode.PDF_PASSWORD_PROTECTED, cause: err });
  }
  if (msg.includes("no pages") || msg.includes("page count")) {
    throw new DocAIError({ code: DocAIErrorCode.PDF_NO_PAGES, cause: err });
  }
  throw new DocAIError({ code: DocAIErrorCode.PDF_CORRUPTED, cause: err });
}
function remapTextractError(err) {
  const name = err?.name ?? "";
  const type = err?.__type ?? "";
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (name === "UnsupportedDocumentException" || type === "UnsupportedDocumentException") {
    throw new DocAIError({ code: DocAIErrorCode.TEXTRACT_UNSUPPORTED, cause: err });
  }
  if (name === "ProvisionedThroughputExceededException" || msg.includes("throttl")) {
    throw new DocAIError({ code: DocAIErrorCode.TEXTRACT_THROTTLED, cause: err });
  }
  throw new DocAIError({ code: DocAIErrorCode.TEXTRACT_FAILED, cause: err });
}
function remapGeminiError(err) {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("quota") || msg.includes("rate limit") || msg.includes("429")) {
    throw new DocAIError({ code: DocAIErrorCode.GEMINI_QUOTA_EXCEEDED, cause: err });
  }
  throw new DocAIError({ code: DocAIErrorCode.GEMINI_FAILED, cause: err });
}

// src/index.ts
var SnappinDocAI = class {
  textractClient;
  google;
  constructor({ vertex, textract }) {
    this.textractClient = new TextractClient({
      region: textract.region,
      credentials: {
        accessKeyId: textract.credentials.accessKeyId,
        secretAccessKey: textract.credentials.secretAccessKey
      }
    });
    const credentials = parseCredentials(vertex.credentials);
    this.google = createVertex({
      project: vertex.projectId,
      location: vertex.location ?? "us-central1",
      googleAuthOptions: { credentials }
    });
  }
  async extract(buffer, options = {}) {
    validateBuffer(buffer);
    const totalStart = Date.now();
    const { template = invoiceTemplate, featureTypes = ["TABLES", "FORMS"] } = options;
    const { zod: outputSchema } = TemplateEngine.toOutputSchema(template);
    const requiredFields = template.fields.filter((f) => !("optional" in f && f.optional)).map((f) => f.name);
    let blocks;
    let pageCount;
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
    const cleaned = cleanTextractOutput(blocks);
    let normalizeResult;
    try {
      const normalizeStart = Date.now();
      normalizeResult = await generateText({
        model: this.google("gemini-2.0-flash-lite"),
        topP: 0,
        maxOutputTokens: 4e3,
        system: BASE_EXTRACTION_PROMPT,
        prompt: JSON.stringify(cleaned),
        experimental_output: Output.object({ schema: outputSchema })
      });
      var geminiDurationMs = Date.now() - normalizeStart;
    } catch (err) {
      if (err instanceof DocAIError) throw err;
      remapGeminiError(err);
    }
    if (!normalizeResult.output) {
      throw new DocAIError({ code: DocAIErrorCode.EXTRACTION_FAILED });
    }
    const finalOutput = normalizeResult.output;
    const missingFields = this._getMissingFields(finalOutput.data, requiredFields);
    if (missingFields.length > 0) {
      throw new DocAIError({
        code: DocAIErrorCode.REQUIRED_FIELDS_MISSING,
        missingFields
      });
    }
    return {
      ...finalOutput,
      usage: {
        inputTokens: normalizeResult.usage.inputTokens ?? 0,
        outputTokens: normalizeResult.usage.outputTokens ?? 0,
        totalTokens: normalizeResult.usage.totalTokens ?? 0
      },
      metrics: {
        totalDurationMs: Date.now() - totalStart,
        textractDurationMs,
        geminiDurationMs,
        pagesProcessed: pageCount,
        textractCallCount: pageCount,
        cleanedTextLength: cleaned.text.length,
        pipeline: "textract_then_gemini"
      }
    };
  }
  // ── Private helpers ───────────────────────────────────────────────────────
  /** Returns field names that are missing or empty across ALL data entries */
  _getMissingFields(data, requiredFields) {
    if (!data || data.length === 0) return requiredFields;
    return requiredFields.filter(
      (field) => data.some((entry) => {
        const val = entry[field];
        return val === void 0 || val === null || val === "";
      })
    );
  }
  async _getPageCount(buffer) {
    try {
      const pdfDoc = await PDFDocument.load(buffer, {
        ignoreEncryption: false
      });
      return pdfDoc.getPageCount();
    } catch (err) {
      remapPdfError(err);
    }
  }
  async _runTextract(buffer, featureTypes) {
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: false });
    } catch (err) {
      remapPdfError(err);
    }
    const pageCount = pdfDoc.getPageCount();
    const allBlocks = [];
    for (let i = 0; i < pageCount; i++) {
      try {
        const singlePage = await PDFDocument.create();
        const [copiedPage] = await singlePage.copyPages(pdfDoc, [i]);
        singlePage.addPage(copiedPage);
        const pageBytes = await singlePage.save();
        const command = new AnalyzeDocumentCommand({
          Document: { Bytes: pageBytes },
          FeatureTypes: featureTypes
        });
        const result = await this.textractClient.send(command);
        const blocks = result.Blocks ?? [];
        for (const block of blocks) {
          if (block.Page !== void 0) block.Page = i + 1;
        }
        allBlocks.push(...blocks);
      } catch (err) {
        if (err instanceof DocAIError) throw err;
        remapTextractError(err);
      }
    }
    return { blocks: allBlocks, pageCount };
  }
};
export {
  DocAIError,
  DocAIErrorCode,
  SnappinDocAI,
  invoiceTemplate
};
