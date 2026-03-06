## Snappin Doc AI

PDF → **structured JSON** using **AWS Textract** + **Google Vertex (Gemini)**.

This package helps you take real‑world documents (right now focused on **invoices/receipts**) and turn them into clean, typed JSON that is easy to use in your app.

- **Input**: a PDF file (as a `Buffer`/`Uint8Array`)
- **Processing**: AWS Textract for OCR → cleaned text → Gemini for structured extraction
- **Output**: strongly‑typed JSON (by default an invoice schema) plus token usage and timing metrics

---

### Installation

Use any Node.js package manager (Node 18+ recommended):

- **pnpm** (recommended):

```bash
pnpm add @snappin/doc-ai
```

- **npm**:

```bash
npm install @snappin/doc-ai
```

This library already bundles its runtime dependencies (Textract, Gemini SDK, `pdf-lib`, `zod`, etc.) in `package.json`, so you usually do **not** need to install anything else manually.

---

### What you need before using it

- **AWS account** with **Textract** enabled
  - An access key with permission to call `Textract:AnalyzeDocument`
- **Google Cloud project** with **Vertex AI / Gemini** enabled
  - A service account JSON key for the project
- A **Node.js environment** where you can load the PDF into a `Buffer` or `Uint8Array`

You do **not** need to know Textract or Gemini in detail; this library hides most of that behind a simple `extract` method.

---

### Quick start (basic invoice extraction)

Beginner‑friendly example in TypeScript:

```ts
import fs from "node:fs/promises";
import { SnappinDocAI, invoiceTemplate } from "@snappin/doc-ai";

async function main() {
  // 1. Create the client with your credentials
  const docAi = new SnappinDocAI({
    textract: {
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    },
    vertex: {
      projectId: "your-gcp-project-id",
      location: "us-central1", // optional, default is us-central1
      // Any of:
      // - a JS object with your service account JSON
      // - a JSON string
      // - a base64‑encoded JSON string
      credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!,
    },
  });

  // 2. Load your PDF into memory
  const pdfBuffer = await fs.readFile("./invoice.pdf");

  // 3. Run extraction (uses the built‑in invoice template by default)
  const result = await docAi.extract(pdfBuffer, {
    template: invoiceTemplate,
    // featureTypes is optional; by default: ["TABLES", "FORMS"]
    // featureTypes: ["TABLES", "FORMS", "SIGNATURES", "LAYOUT"],
  });

  console.log("Total pages:", result.totalPages);
  console.log("Total invoices detected:", result.totalInvoices);
  console.log("First invoice data:", result.data[0]);
}

main().catch((err) => {
  console.error(err);
});
```

The `result.data` array contains one object per detected invoice, with fields such as:

- **invoiceNumber**
- **invoiceDate**
- **vendorName**
- **totalAmount**
- **currency**
- **documentType** (`"invoice"` or `"receipt"`)
- many more optional fields like `lineItems`, `taxAmount`, `summary`, etc.

---

### Library API overview

- **`class SnappinDocAI`** (from `src/index.ts`)
  - **`constructor(config: SnappinDocAIConfig)`**
    - **`textract`**: AWS region + credentials
    - **`vertex`**: GCP project info + credentials (object/JSON/base64 JSON)
  - **`extract(buffer, options?)`** → `Promise<ExtractionOutput>`
    - `buffer`: `Buffer` or `Uint8Array` containing the PDF
    - `options.template` (optional): a `DocumentTemplate` (defaults to `invoiceTemplate`)
    - `options.featureTypes` (optional): Textract features like `"TABLES"`, `"FORMS"`, `"SIGNATURES"`, `"LAYOUT"`

- **Types & helpers you can import**
  - **`invoiceTemplate`**: ready‑to‑use invoice/receipt schema
  - **`type DocumentTemplate, TemplateField, TemplateFieldType, InferTemplate`**
  - **`type CleanedTextractOutput`**
  - **`class DocAIError`, `DocAIErrorCode`**

---

### Credentials handling (beginner explanation)

The Vertex AI part expects service‑account credentials. Internally we use a helper called `parseCredentials`:

- If you pass a **plain JS object**, it is used directly.
- If you pass a **JSON string**, it is parsed with `JSON.parse`.
- If you pass a **base64‑encoded JSON string**, it is decoded and parsed.

This means you can store credentials in environment variables safely. Example:

```bash
# .env (example)
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account", ...}'
```

And in code:

```ts
const docAi = new SnappinDocAI({
  vertex: {
    projectId: "your-gcp-project-id",
    location: "us-central1",
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!, // works for object/JSON/base64 JSON
  },
  textract: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  },
});
```

---

### Error handling

Most common failures are wrapped in a friendly `DocAIError` with a `code` you can check.

```ts
import { DocAIError, DocAIErrorCode } from "@snappin/doc-ai";

try {
  const result = await docAi.extract(pdfBuffer);
  // use result.data here
} catch (err) {
  if (err instanceof DocAIError) {
    console.error("Doc AI failed with code:", err.code);

    if (err.code === DocAIErrorCode.REQUIRED_FIELDS_MISSING) {
      console.error("Missing fields:", err.missingFields);
    }
  } else {
    console.error("Unexpected error:", err);
  }
}
```

Some example error codes:

- **PDF_EMPTY**: the provided buffer has no bytes
- **PDF_TOO_LARGE**: more than 10 MB
- **PDF_UNSUPPORTED_FORMAT**: not a PDF (for example a JPEG)
- **TEXTRACT_UNSUPPORTED / TEXTRACT_THROTTLED / TEXTRACT_FAILED**
- **GEMINI_FAILED / GEMINI_QUOTA_EXCEEDED**
- **REQUIRED_FIELDS_MISSING**: extraction succeeded, but one or more required fields are missing or empty in the output

---

### Defining your own template (advanced but beginner‑friendly)

If you want to extract data that is **not** an invoice, you can define your own `DocumentTemplate` and still get type‑safe results:

```ts
import { type DocumentTemplate, type TemplateFieldType, TemplateEngine } from "@snappin/doc-ai";

const receiptTemplate: DocumentTemplate = {
  name: "receipt",
  description: "Simple store receipt",
  fields: [
    {
      name: "storeName",
      type: "string" as TemplateFieldType,
      description: "Name of the store",
    },
    {
      name: "totalAmount",
      type: "number" as TemplateFieldType,
      description: "Total amount paid",
    },
  ],
} as const;

type ReceiptData = import("@snappin/doc-ai").InferTemplate<typeof receiptTemplate>;

const result = await docAi.extract< typeof receiptTemplate >(pdfBuffer, {
  template: receiptTemplate,
});

const firstReceipt: ReceiptData = result.data[0];
```

Under the hood, the `TemplateEngine` converts your template into a `zod` schema and a JSON Schema, which Gemini uses to fill in the correct structure.

---

### Metrics and usage info

`ExtractionOutput` includes helpful metadata:

- **usage**
  - **inputTokens**: tokens sent to Gemini
  - **outputTokens**: tokens returned by Gemini
  - **totalTokens**: sum of the above
- **metrics**
  - **totalDurationMs**: total time for the whole pipeline
  - **textractDurationMs**: time spent in Textract
  - **geminiDurationMs**: time spent in Gemini
  - **pagesProcessed** / **textractCallCount**
  - **cleanedTextLength**: length of the cleaned text fed to Gemini

You can log these to monitor performance and cost.

---

### Running tests (for contributors)

If you are working on this library locally:

```bash
pnpm install
pnpm test
```

The test suite (`src/__test__/index.test.ts`) uses `vitest` and mocks all external services (Textract, Gemini, pdf-lib), so it runs without real AWS/GCP credentials.

---

### License

**ISC** – see the license field in `package.json`.


