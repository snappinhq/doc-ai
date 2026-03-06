import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ─── Template Definition Types ────────────────────────────────────────────────

export type TemplateFieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "string[]"
  | "number[]"
  | "object[]";

export interface TemplateField {
  readonly name: string;
  readonly type: TemplateFieldType;
  readonly description: string;
  readonly optional?: boolean;
  /** Nested fields — required when type is "object[]" */
  readonly fields?: readonly TemplateField[];
  /** Constrain to specific string values — generates a union type + z.enum() */
  readonly enum?: readonly [string, ...string[]];
}

export interface DocumentTemplate {
  readonly name: string;
  readonly description?: string;
  readonly fields: readonly TemplateField[];
}

// ─── TypeScript Type Inference ────────────────────────────────────────────────

type FieldTypeMap = {
  string: string;
  number: number;
  boolean: boolean;
  date: string;
  "string[]": string[];
  "number[]": number[];
  "object[]": Record<string, unknown>;
};

type InferFieldValue<F extends TemplateField> =
  // If enum is defined, infer the union of its literal values
  F extends { readonly enum: readonly (infer E extends string)[] }
    ? E
    : // If object[], recurse into nested fields
    F extends { readonly type: "object[]"; readonly fields: readonly TemplateField[] }
    ? InferTemplateShape<F["fields"]>[]
    : // Otherwise map primitive type
    F["type"] extends keyof FieldTypeMap
    ? FieldTypeMap[F["type"]]
    : never;

type InferTemplateField<F extends TemplateField> =
  F extends { readonly optional: true }
    ? InferFieldValue<F> | undefined
    : InferFieldValue<F>;

type InferTemplateShape<Fields extends readonly TemplateField[]> = {
  [F in Fields[number] as F["name"]]: InferTemplateField<F>;
};

/** Infer the TypeScript output type from a DocumentTemplate */
export type InferTemplate<T extends DocumentTemplate> = InferTemplateShape<T["fields"]>;

// ─── Zod type map ─────────────────────────────────────────────────────────────

function fieldToZod(field: TemplateField): z.ZodTypeAny {
  const base = (() => {
    // Enum takes priority — produces z.enum(["a","b",...])
    if (field.enum && field.enum.length > 0) {
      return z.enum(field.enum as [string, ...string[]]);
    }

    switch (field.type) {
      case "string":   return z.string();
      case "number":   return z.number();
      case "boolean":  return z.boolean();
      case "date":     return z.string(); // ISO date string
      case "string[]": return z.array(z.string());
      case "number[]": return z.array(z.number());
      case "object[]": {
        if (!field.fields?.length)
          throw new Error(`object[] field "${field.name}" must define nested fields`);
        const shape: z.ZodRawShape = {};
        for (const nested of field.fields) {
          shape[nested.name] = fieldToZod(nested);
        }
        return z.array(z.object(shape));
      }
      default: return z.string();
    }
  })();

  const described = base.describe(field.description);
  return field.optional ? described.optional() : described;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class TemplateEngine {
  static toZodSchema(template: DocumentTemplate): z.ZodObject<z.ZodRawShape> {
    const shape: z.ZodRawShape = {};
    for (const field of template.fields) {
      shape[field.name] = fieldToZod(field);
    }
    return z.object(shape);
  }

  static toOutputSchema(template: DocumentTemplate): {
    zod: z.ZodObject<z.ZodRawShape>;
    jsonSchema: object;
    jsonSchemaString: string;
  } {
    const itemSchema = TemplateEngine.toZodSchema(template);

    const outputSchema = z.object({
      totalPages: z.number().describe("Total number of pages in the PDF document"),
      totalInvoices: z.number().describe("Total number of individual invoices detected across all pages"),
      data: z.array(itemSchema).describe("One entry per detected invoice in document order"),
    });

    const jsonSchema = zodToJsonSchema(outputSchema, {
      name: template.name,
      errorMessages: true,
    });

    return {
      zod: outputSchema,
      jsonSchema,
      jsonSchemaString: JSON.stringify(jsonSchema, null, 2),
    };
  }
}