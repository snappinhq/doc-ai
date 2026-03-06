import type { Block } from "@aws-sdk/client-textract";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CleanPage {
  page: number;
  lines: string[];
  tables: string[][][];    // each string[] is a row of cells
  forms: Record<string, string>; // key → value pairs
}

export interface CleanedTextractOutput {
  totalPages: number;
  pages: CleanPage[];
  /** Flat readable text used as Gemini prompt input */
  text: string;
}

// ─── Cleaner ─────────────────────────────────────────────────────────────────

/**
 * Strips ALL geometry (BoundingBox, Polygon), confidence scores, IDs,
 * and relationships metadata from raw Textract blocks.
 *
 * Produces a clean per-page structure with:
 *  - Plain LINE text
 *  - TABLE rows as 2-D string arrays
 *  - FORM key→value pairs
 */
export function cleanTextractOutput(blocks: Block[]): CleanedTextractOutput {
  const blockMap = new Map<string, Block>();
  for (const b of blocks) {
    if (b.Id) blockMap.set(b.Id, b);
  }

  // Group PAGE blocks
  const pageBlocks = blocks.filter((b) => b.BlockType === "PAGE");
  const totalPages = pageBlocks.length || 1;

  const pages: CleanPage[] = pageBlocks.map((pageBlock) => {
    const pageNum = pageBlock.Page ?? 1;
    const childIds = getChildIds(pageBlock);

    const lines: string[] = [];
    const tables: string[][][] = [];
    const forms: Record<string, string> = {};

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

  // Fallback: if no PAGE blocks, collect all LINEs into page 1
  if (pages.length === 0) {
    const lines = blocks
      .filter((b) => b.BlockType === "LINE" && b.Text)
      .map((b) => b.Text!);
    pages.push({ page: 1, lines, tables: [], forms: {} });
  }

  return {
    totalPages,
    pages,
    text: renderCleanText(pages),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getChildIds(block: Block): string[] {
  return (
    block.Relationships?.filter((r) => r.Type === "CHILD")
      .flatMap((r) => r.Ids ?? []) ?? []
  );
}

function getCellText(cell: Block, blockMap: Map<string, Block>): string {
  const wordIds = getChildIds(cell);
  return wordIds
    .map((id) => blockMap.get(id))
    .filter((b): b is Block => !!b && b.BlockType === "WORD")
    .map((b) => b.Text ?? "")
    .join(" ")
    .trim();
}

function extractTable(
  tableBlock: Block,
  blockMap: Map<string, Block>,
  out: string[][][]
): void {
  const cellIds = getChildIds(tableBlock);
  const grid: Map<string, string> = new Map(); // "row,col" → text
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

  const tableRows: string[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = 1; c <= maxCol; c++) {
      row.push(grid.get(`${r},${c}`) ?? "");
    }
    tableRows.push(row);
  }
  out.push(tableRows);
}

function extractKVPair(
  keyBlock: Block,
  blockMap: Map<string, Block>
): { key: string; value: string } {
  // Key text comes from WORD children of the KEY block
  const keyWordIds = getChildIds(keyBlock);
  const key = keyWordIds
    .map((id) => blockMap.get(id))
    .filter((b): b is Block => !!b && b.BlockType === "WORD")
    .map((b) => b.Text ?? "")
    .join(" ")
    .trim();

  // Value block is linked via VALUE relationship
  const valueBlockId = keyBlock.Relationships?.find(
    (r) => r.Type === "VALUE"
  )?.Ids?.[0];

  let value = "";
  if (valueBlockId) {
    const valueBlock = blockMap.get(valueBlockId);
    if (valueBlock) {
      const valueWordIds = getChildIds(valueBlock);
      value = valueWordIds
        .map((id) => blockMap.get(id))
        .filter((b): b is Block => !!b && b.BlockType === "WORD")
        .map((b) => b.Text ?? "")
        .join(" ")
        .trim();
    }
  }

  return { key, value };
}

/**
 * Renders clean pages into a readable markdown-like string for Gemini.
 * No IDs, no geometry, no confidence scores — just content.
 */
function renderCleanText(pages: CleanPage[]): string {
  return pages
    .map((p) => {
      const parts: string[] = [`=== PAGE ${p.page} ===`];

      // Lines
      if (p.lines.length) parts.push(p.lines.join("\n"));

      // Form fields
      if (Object.keys(p.forms).length) {
        parts.push("\n[FORM FIELDS]");
        for (const [k, v] of Object.entries(p.forms)) {
          parts.push(`${k}: ${v}`);
        }
      }

      // Tables as markdown
      for (const table of p.tables) {
        parts.push("\n[TABLE]");
        for (const row of table) {
          parts.push(`| ${row.join(" | ")} |`);
        }
      }

      return parts.join("\n");
    })
    .join("\n\n");
}