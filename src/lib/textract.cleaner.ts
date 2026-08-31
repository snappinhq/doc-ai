import type { Block } from "@aws-sdk/client-textract";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CleanPage {
  page: number;
  lines: string[];
  tables: string[][][];        // each string[] is a row of cells
  forms: Record<string, string>; // key → value pairs
}

export interface CleanedTextractOutput {
  totalPages: number;
  pages: CleanPage[];
  linesWithPages: LineWithPage[];
  text: string;
}

export interface LineWithPage {
  text: string;
  page: number;
}

// ─── Cleaner ─────────────────────────────────────────────────────────────────

/**
 * Strips ALL geometry, confidence scores, IDs, and relationships metadata from raw Textract blocks.
 * Groups content strictly by block.Page numbers returned by Textract.
 */
export function cleanTextractOutput(blocks: Block[]): CleanedTextractOutput {
  const blockMap = new Map<string, Block>();
  const pageMap = new Map<number, Block[]>();

  for (const b of blocks) {
    if (b.Id) blockMap.set(b.Id, b);
    const pageNum = b.Page ?? 1;
    if (!pageMap.has(pageNum)) {
      pageMap.set(pageNum, []);
    }
    pageMap.get(pageNum)!.push(b);
  }

  const sortedPageNumbers = Array.from(pageMap.keys()).sort((a, b) => a - b);
  const totalPages = sortedPageNumbers.length || 1;
  const linesWithPages: LineWithPage[] = [];

  const pages: CleanPage[] = sortedPageNumbers.map((pageNum) => {
    const pageBlocks = pageMap.get(pageNum) ?? [];
    const lines: string[] = [];
    const tables: string[][][] = [];
    const forms: Record<string, string> = {};

    for (const child of pageBlocks) {
      switch (child.BlockType) {
        case "LINE":
          if (child.Text) {
            lines.push(child.Text);
            linesWithPages.push({ text: child.Text, page: pageNum });
          }
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

  return {
    totalPages,
    pages,
    linesWithPages,
    text: renderCleanText(pages),
  };
}

function renderCleanText(pages: CleanPage[]): string {
  return pages
    .map((p) => {
      const parts: string[] = [`=== START OF PAGE ${p.page} ===`];

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

      parts.push(`=== END OF PAGE ${p.page} ===`);
      return parts.join("\n");
    })
    .join("\n\n");
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
  const grid: Map<string, string> = new Map();
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
  const keyWordIds = getChildIds(keyBlock);
  const key = keyWordIds
    .map((id) => blockMap.get(id))
    .filter((b): b is Block => !!b && b.BlockType === "WORD")
    .map((b) => b.Text ?? "")
    .join(" ")
    .trim();

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