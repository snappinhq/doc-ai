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

// src/templates/invoice.ts
import { z } from "zod";
var ZInvoiceLineItem = z.object({
  description: z.string().nullable().optional().describe("Name or description of the product or service"),
  quantity: z.number().optional().describe("Quantity of units for this line item"),
  unitPrice: z.number().optional().describe("Price per unit."),
  taxRate: z.number().optional().describe("Tax rate as a percentage for this line item (e.g. 18 for 18%). Omit if not stated."),
  tax: z.number().optional().describe("Tax amount for this line item in minor units."),
  discount: z.number().optional().describe("Discount applied to this line item."),
  total: z.number().optional().describe("Total amount for this line item after tax and discount.")
});
var ZInvoiceData = z.object({
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
  lineItems: z.array(ZInvoiceLineItem).optional().describe("All line items found in the invoice")
});
var BAD = /* @__PURE__ */ new Set(["null", "undefined", "unknown", "missing", "n/a", "none", "-", "--", "not found", "not available", ""]);
function cleanNullStrings(obj) {
  if (typeof obj === "string") {
    return BAD.has(obj.trim().toLowerCase()) ? null : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanNullStrings);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, cleanNullStrings(v)])
    );
  }
  return obj;
}
var ZExtractionOutput = z.object({
  totalPages: z.number(),
  totalInvoices: z.number(),
  data: z.array(ZInvoiceData)
}).transform((output) => cleanNullStrings(output));

// src/prompt.ts
var BASE_EXTRACTION_PROMPT = `
You are an expert in structured data extraction. Your task is to extract information from unstructured content and transform it into the specified structure. Follow these rules strictly:

1. Handle Missing or Undetermined Data:
- If any field's information is missing, unknown, or cannot be determined, return its value as null.
- **Do not use substitutes such as "unknown," "missing," or any other placeholder for missing or unknown data. The value **must** always be explicitly null.
-There may be multiple invoices in a single PDF \u2014 detect each one separately
- The value must be actual JSON null, not the text "null" in quotes.
Dates:
- Return dates in ISO 8601 format (YYYY-MM-DD) only.
Number fields:
- Never return "null", "0" as a substitute for missing, or any string for a number field.
Amounts:
- All monetary amounts must be returned in minor units (e.g. cents). Multiply decimal values by 100 and round to the nearest integer (e.g. $12.50 \u2192 1250).
vendorName:
- must be first letter of each word capital, rest are lowercase
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
var REQUIRED_FIELDS = Object.entries(ZInvoiceData.shape).filter(([, field]) => !field.isOptional()).map(([key]) => key);
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
    const { featureTypes = ["TABLES", "FORMS"] } = options;
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
        experimental_output: Output.object({ schema: ZExtractionOutput })
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
    const missingFields = this._getMissingFields(finalOutput.data, REQUIRED_FIELDS);
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
  _getMissingFields(data, requiredFields) {
    if (!data || data.length === 0) return requiredFields;
    return requiredFields.filter(
      (field) => data.some((entry) => {
        const val = entry[field];
        return val === void 0 || val === null || val === "";
      })
    );
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
  ZExtractionOutput,
  ZInvoiceData,
  ZInvoiceLineItem
};
