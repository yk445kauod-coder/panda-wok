import "server-only";

import { buildDocx, type DocBlock } from "@/lib/agent/docx";
import { buildPdf, type PdfBlock } from "@/lib/agent/pdf";
import { buildWorkbook, type Sheet } from "@/lib/agent/xlsx";

/**
 * Converts a rendered markdown deliverable into the binary office formats.
 *
 * Every deliverable already renders to markdown from live data. Rather than
 * teach seven renderers to emit five formats each, the markdown is parsed back
 * into structured blocks once and then written out — so a report can be handed
 * over as a PDF, an Excel workbook or a Word document without the numbers
 * taking a second path through the database.
 *
 * The markdown is produced by this codebase, so its shape is known: `#`/`##`
 * headings, `| … |` tables, `-` bullets, `1.` numbered steps, and paragraphs.
 */

export type DocBlockIR =
  | { type: "heading"; text: string; level: 1 | 2 | 3 }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbers"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "note"; text: string };

/** Splits a markdown table row into cells, dropping the outer pipes. */
function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

const isSeparator = (line: string) => /^\|?[\s:|-]+\|?$/.test(line) && line.includes("-");

/** Strips the inline markdown this codebase emits (`**bold**`, `_note_`). */
function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
}

export function parseMarkdown(markdown: string): DocBlockIR[] {
  const lines = markdown.split("\n");
  const blocks: DocBlockIR[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        text: plain(heading[2]),
        level: heading[1].length as 1 | 2 | 3,
      });
      i += 1;
      continue;
    }

    // A table is a header row, a separator, then body rows.
    if (line.trim().startsWith("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const headers = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(plain(lines[i].trim().replace(/^[-*]\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(plain(lines[i].trim().replace(/^\d+[.)]\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "numbers", items });
      continue;
    }

    // A line that is entirely italic is treated as a note.
    const note = /^_(.+)_$/.exec(line.trim());
    if (note) {
      blocks.push({ type: "note", text: plain(note[1]) });
      i += 1;
      continue;
    }

    // Otherwise gather the paragraph up to the next blank line or block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s/.test(lines[i]) &&
      !lines[i].trim().startsWith("|") &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length > 0) blocks.push({ type: "paragraph", text: plain(para.join(" ")) });
  }

  return blocks;
}

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
        out.push({ type: "heading", text: block.text, level: block.level });
        break;
      case "paragraph":
        out.push({ type: "paragraph", text: block.text });
        break;
      case "bullets":
        out.push({ type: "bullets", items: block.items });
        break;
      case "numbers":
        out.push({ type: "numbers", items: block.items });
        break;
      case "table":
        out.push({ type: "table", headers: block.headers, rows: block.rows });
        break;
      case "note":
        out.push({ type: "note", text: block.text });
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
        return { type: "heading", text: block.text, level: block.level };
      case "bullets":
        return { type: "bullets", items: block.items };
      case "numbers":
        return { type: "numbers", items: block.items };
      case "table":
        return { type: "table", headers: block.headers, rows: block.rows };
      case "note":
        return { type: "note", text: block.text };
      default:
        return { type: "paragraph", text: block.text };
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
    if (block.type === "heading") prose.push([block.text]);
    else if (block.type === "paragraph") prose.push([block.text]);
    else if (block.type === "bullets" || block.type === "numbers") {
      for (const item of block.items) prose.push([`• ${item}`]);
    } else if (block.type === "note") prose.push([block.text]);
  }
  if (prose.length > 0) {
    sheets.push({ name: "Report", rows: [[title], [], ...prose], widths: [80] });
  }

  const tables = blocks.filter((b): b is Extract<DocBlockIR, { type: "table" }> => b.type === "table");
  tables.forEach((table, index) => {
    // Numeric columns are detected from the data so money lands as money and
    // can be summed, rather than arriving as text in a spreadsheet.
    const moneyColumns: number[] = [];
    table.headers.forEach((_, c) => {
      const values = table.rows.map((r) => r[c] ?? "").filter(Boolean);
      if (values.length > 0 && values.every((v) => asNumber(v) !== null)) moneyColumns.push(c);
    });

    const rows: Sheet["rows"] = [
      table.headers,
      ...table.rows.map((row) =>
        row.map((cell) => {
          const n = asNumber(cell);
          return n !== null ? n : cell;
        }),
      ),
    ];
    sheets.push({
      name: table.headers[0]?.slice(0, 28) || `Table ${index + 1}`,
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
  return [table.headers, ...table.rows].map((row) => row.map(escape).join(",")).join("\n");
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
