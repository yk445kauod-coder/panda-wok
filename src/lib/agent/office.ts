import "server-only";

import { buildDocx, type DocBlock } from "@/lib/agent/docx";
import { buildPdf, type PdfBlock } from "@/lib/agent/pdf";
import { buildWorkbook, type Sheet } from "@/lib/agent/xlsx";
import { parseMarkdown, plainText, type MdBlock } from "@/lib/markdown";

/**
 * Converts a rendered markdown deliverable into the binary office formats.
 *
 * Every deliverable already renders to markdown from live data. Rather than
 * teach seven renderers to emit five formats each, the markdown is parsed back
 * into structured blocks once and then written out — so a report can be handed
 * over as a PDF, an Excel workbook or a Word document without the numbers
 * taking a second path through the database.
 *
 * The parse itself lives in `@/lib/markdown`, shared with the chat renderer, so
 * a table reads the same in the browser as it does in the PDF of the same
 * answer. This module only adds the binary writers.
 */

export type DocBlockIR = MdBlock;

/** Strips inline markdown to plain text, for the binary exporters. */
const plain = plainText;

export { parseMarkdown };

/** Markdown -> PDF blocks, promoting the first heading to the document title. */
export function toPdfBlocks(markdown: string, title: string): PdfBlock[] {
  const blocks = parseMarkdown(markdown);
  const out: PdfBlock[] = [{ type: "title", text: title }];
  blocks.forEach((block, index) => {
    // The markdown leads with the document's own H1, which the title block has
    // already drawn; keeping it would print the same line twice.
    if (index === 0 && block.type === "heading" && block.level === 1) return;
    switch (block.type) {
      case "heading":
        out.push({ type: "heading", text: plain(block.text), level: block.level });
        break;
      case "paragraph":
        out.push({ type: "paragraph", text: plain(block.text) });
        break;
      case "bullets":
        out.push({ type: "bullets", items: block.items.map(plain) });
        break;
      case "numbers":
        out.push({ type: "numbers", items: block.items.map(plain) });
        break;
      case "table":
        out.push({
          type: "table",
          headers: block.headers.map(plain),
          rows: block.rows.map((row) => row.map(plain)),
        });
        break;
      case "note":
        out.push({ type: "note", text: plain(block.text) });
        break;
    }
  });
  return out;
}

/** Markdown -> Word blocks. */
export function toDocBlocks(markdown: string): DocBlock[] {
  const blocks = parseMarkdown(markdown);
  return blocks.map((block): DocBlock => {
    switch (block.type) {
      case "heading":
        return { type: "heading", text: plain(block.text), level: block.level };
      case "bullets":
        return { type: "bullets", items: block.items.map(plain) };
      case "numbers":
        return { type: "numbers", items: block.items.map(plain) };
      case "table":
        return {
          type: "table",
          headers: block.headers.map(plain),
          rows: block.rows.map((row) => row.map(plain)),
        };
      case "note":
        return { type: "note", text: plain(block.text) };
      default:
        return { type: "paragraph", text: plain(block.text) };
    }
  });
}

/** True when a cell is a number the spreadsheet should treat as numeric. */
function asNumber(value: string): number | null {
  const cleaned = value.replace(/[,\s]/g, "").replace(/EGP|ج\.م/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Markdown -> workbook. Each table becomes its own sheet; the prose becomes a
 * "Report" sheet, so a workbook of a written report is still readable and not
 * just bare tables.
 */
export function toSheets(markdown: string, title: string): Sheet[] {
  const blocks = parseMarkdown(markdown);
  const sheets: Sheet[] = [];

  const prose: Sheet["rows"] = [];
  for (const block of blocks) {
    if (block.type === "heading") prose.push([plain(block.text)]);
    else if (block.type === "paragraph") prose.push([plain(block.text)]);
    else if (block.type === "bullets" || block.type === "numbers") {
      for (const item of block.items) prose.push([`• ${plain(item)}`]);
    } else if (block.type === "note") prose.push([plain(block.text)]);
  }
  if (prose.length > 0) {
    sheets.push({ name: "Report", rows: [[title], [], ...prose], widths: [80] });
  }

  const tables = blocks.filter((b): b is Extract<DocBlockIR, { type: "table" }> => b.type === "table");
  tables.forEach((table, index) => {
    // Inline markup is stripped before numeric detection, so `**4,250**` still
    // lands in the spreadsheet as a number rather than a bold-looking string.
    const headers = table.headers.map(plain);
    const body = table.rows.map((row) => row.map(plain));
    // Numeric columns are detected from the data so money lands as money and
    // can be summed, rather than arriving as text in a spreadsheet.
    const moneyColumns: number[] = [];
    headers.forEach((_, c) => {
      const values = body.map((r) => r[c] ?? "").filter(Boolean);
      if (values.length > 0 && values.every((v) => asNumber(v) !== null)) moneyColumns.push(c);
    });

    const rows: Sheet["rows"] = [
      headers,
      ...body.map((row) =>
        row.map((cell) => {
          const n = asNumber(cell);
          return n !== null ? n : cell;
        }),
      ),
    ];
    sheets.push({
      name: headers[0]?.slice(0, 28) || `Table ${index + 1}`,
      rows,
      moneyColumns,
      freezeHeader: true,
    });
  });

  if (sheets.length === 0) sheets.push({ name: "Report", rows: [[title], [markdown]] });
  return sheets;
}

/** Markdown -> CSV, using the first table found. */
export function toCsv(markdown: string): string {
  const table = parseMarkdown(markdown).find((b) => b.type === "table");
  if (!table || table.type !== "table") return "";
  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [table.headers, ...table.rows]
    .map((row) => row.map((cell) => escape(plain(cell))).join(","))
    .join("\n");
}

/** Builds the binary body for an office format. */
export function renderOfficeFormat(
  format: "pdf" | "docx" | "xlsx",
  markdown: string,
  title: string,
  now = new Date(),
): Uint8Array {
  switch (format) {
    case "pdf":
      return buildPdf({ title, blocks: toPdfBlocks(markdown, title), now });
    case "docx":
      return buildDocx({ title, blocks: toDocBlocks(markdown), now });
    case "xlsx":
      return buildWorkbook(toSheets(markdown, title), now);
  }
}

/* ------------------------------------------------ HTML deliverables -> office */

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function htmlTableToMarkdown(table: string): string {
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => stripTags(c[1])),
  );
  if (rows.length === 0) return "";
  const headers = rows[0];
  const body = rows.slice(1);
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const escape = (cells: string[]) => cells.map((c) => c.replace(/\|/g, "\\|"));
  return [
    line(escape(headers)),
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...body.map((r) => line(escape(r))),
  ].join("\n");
}

/**
 * Converts one of this codebase's HTML deliverables to markdown, so the chart
 * pages and decks can also be handed over as PDF, Word or a workbook.
 *
 * The HTML is generated by `html.ts`, so its shape is known: sections with an
 * `h2`, `.kpis` tiles, real `<table>`s and `.note` callouts. Inline SVG charts
 * are dropped — a chart cannot be carried into a spreadsheet, and the table and
 * KPI figures beside it hold the same numbers.
 */
export function htmlToMarkdown(html: string): string {
  let out = html
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "");

  // KPI tiles become labelled bullets before the generic tag strip runs. The
  // tiles are matched one at a time: the `.kpis` wrapper is a grid of sibling
  // `.kpi` divs, so a single non-greedy match on the wrapper stops at the first
  // tile and silently drops the rest.
  out = out.replace(
    /<div class="kpi"><div class="label">([\s\S]*?)<\/div><div class="value">([\s\S]*?)<\/div><\/div>/g,
    (_, label, value) => `\n- **${stripTags(label)}**: ${stripTags(value)}\n`,
  );

  out = out.replace(/<table>[\s\S]*?<\/table>/g, (table) => `\n${htmlTableToMarkdown(table)}\n`);
  out = out.replace(/<div class="note[^"]*">([\s\S]*?)<\/div>/g, (_, text) => `\n_${stripTags(text)}_\n`);
  out = out.replace(/<p class="chart-empty">([\s\S]*?)<\/p>/g, (_, text) => `\n_${stripTags(text)}_\n`);
  out = out.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (_, t) => `\n# ${stripTags(t)}\n`);
  out = out.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_, t) => `\n## ${stripTags(t)}\n`);
  out = out.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (_, t) => `\n### ${stripTags(t)}\n`);
  out = out.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_, t) => `\n- ${stripTags(t)}`);
  out = out.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_, t) => `\n${stripTags(t)}\n`);
  out = out.replace(/<\/section>/g, "\n");

  out = decodeEntities(out.replace(/<[^>]+>/g, "\n"));
  return out
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1].length > 0))
    .join("\n")
    .trim();
}
