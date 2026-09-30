import "server-only";

import { shapeParagraph, isRtl } from "@/lib/agent/arabic";
import {
  PDF_FONT_BASE64,
  PDF_FONT_ENTRIES,
  PDF_FONT_METRICS,
  PDF_FONT_UPEM,
} from "@/lib/agent/pdf-font.generated";

/**
 * A PDF writer, by hand.
 *
 * The owner asked for PDF reports, and PDF is the one format that cannot be
 * faked: it needs a real file with a font embedded, or an Arabic report arrives
 * as boxes and question marks. There is no PDF library in the project and
 * adding one (pdfkit, pdf-lib) would pull a large dependency into the Worker
 * bundle, so the file is written directly. The format is well specified and
 * this covers what a report needs: text with mixed Arabic/Latin, headings,
 * tables with rules, page numbers and correct RTL layout.
 *
 * Two things make Arabic work here:
 *  - the text is pre-shaped into Arabic Presentation Forms-B and reordered
 *    right-to-left by `arabic.ts`, because PDF does no shaping;
 *  - the subset font (which carries both the Latin and the shaped Arabic
 *    glyphs) is embedded as a Type0/CIDFontType2 with an Identity-H encoding,
 *    so every glyph is addressed by its own id.
 */

const PAGE_WIDTH = 595.28; // A4 at 72 dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const FONT_SIZE = 10.5;
const LINE_HEIGHT = 15;
const HEADING_SIZES = { 1: 20, 2: 15, 3: 12.5 } as const;

const INK = [0.11, 0.16, 0.14] as const;
const MUTED = [0.42, 0.48, 0.45] as const;
const RULE = [0.78, 0.77, 0.72] as const;
const ACCENT = [0.18, 0.44, 0.32] as const;

const GLYPHS = new Map<number, { gid: number; width: number }>(
  PDF_FONT_ENTRIES.map(([cp, gid, width]) => [cp, { gid, width }]),
);

export type PdfBlock =
  | { type: "title"; text: string }
  | { type: "heading"; text: string; level?: 1 | 2 | 3 }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbers"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][]; moneyColumns?: number[] }
  | { type: "note"; text: string }
  | { type: "spacer" }
  | { type: "pageBreak" };

type Op = string;

/** Text width in points, using the embedded font's own advance widths. */
function measure(text: string, size: number): number {
  let units = 0;
  for (const ch of text) {
    const glyph = GLYPHS.get(ch.codePointAt(0) ?? 0);
    // A missing glyph still occupies space; the reader draws .notdef.
    units += glyph ? glyph.width : PDF_FONT_UPEM / 2;
  }
  return (units / PDF_FONT_UPEM) * size;
}

/** Hexadecimal UTF-16BE of the glyph ids, which is what Identity-H expects. */
function hexGlyphs(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const glyph = GLYPHS.get(cp);
    out += (glyph ? glyph.gid : 0).toString(16).padStart(4, "0");
  }
  return out;
}

/** Wraps text to a width, splitting on spaces and never inside a word. */
function wrap(text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate, size) <= width) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // A single word wider than the column is broken rather than dropped.
        if (measure(word, size) > width) {
          let chunk = "";
          for (const ch of word) {
            if (measure(chunk + ch, size) > width) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

class Page {
  ops: Op[] = [];
  y = PAGE_HEIGHT - MARGIN;

  constructor(public index: number) {}

  get remaining(): number {
    return this.y - MARGIN;
  }

  text(
    value: string,
    opts: {
      size?: number;
      color?: readonly number[];
      align?: "start" | "end";
      x?: number;
      width?: number;
      lineHeight?: number;
    } = {},
  ): void {
    const size = opts.size ?? FONT_SIZE;
    const color = opts.color ?? INK;
    const rtl = isRtl(value);
    // `start` is the leading edge: right for Arabic, left for Latin.
    const align = opts.align ?? "start";
    const lineHeight = opts.lineHeight ?? LINE_HEIGHT;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? CONTENT_WIDTH;

    // Reorder and shape per line; wrapping must happen on the *visual* text so
    // a line break does not split a shaped cluster.
    const visual = shapeParagraph(value);
    for (const line of wrap(visual, size, width)) {
      if (this.remaining < lineHeight) return;
      const w = measure(line, size);
      const atEnd = align === "end" || (align === "start" && rtl);
      const tx = atEnd ? x + width - w : x;
      this.ops.push(
        `BT /F1 ${size} Tf ${color.join(" ")} rg ` +
          `${tx.toFixed(2)} ${(this.y - size).toFixed(2)} Td <${hexGlyphs(line)}> Tj ET`,
      );
      this.y -= lineHeight;
    }
  }

  rect(x: number, y: number, w: number, h: number, color: readonly number[]): void {
    this.ops.push(
      `${color.join(" ")} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, color: readonly number[]): void {
    this.ops.push(
      `${color.join(" ")} RG 0.5 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  }
}

function isNumericColumn(rows: string[][], index: number): boolean {
  const values = rows.map((r) => r[index]).filter((v) => v !== undefined && v !== "");
  if (values.length === 0) return false;
  return values.every((v) => /^-?[\d,]+(\.\d+)?\s*[A-Za-z\u0600-\u06ff]*$/.test(v.trim()));
}

/** Lays out a table with per-column widths and right-aligned numeric columns. */
function drawTable(page: Page, block: Extract<PdfBlock, { type: "table" }>, newPage: () => Page): Page {
  const columns = block.headers.length;
  if (columns === 0) return page;

  const numeric = new Set<number>();
  for (let c = 0; c < columns; c += 1) {
    if (isNumericColumn(block.rows, c)) numeric.add(c);
  }

  // Column widths follow the longest cell, clamped so one long dish name
  // cannot squash the rest of the table.
  const weights = block.headers.map((h, c) => {
    const cells = [h, ...block.rows.map((r) => r[c] ?? "")];
    const widest = Math.max(...cells.map((v) => measure(v, FONT_SIZE)));
    return Math.min(Math.max(widest, 40), CONTENT_WIDTH / 3);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * CONTENT_WIDTH);

  const drawHeader = (p: Page): Page => {
    if (p.remaining < LINE_HEIGHT * 2) {
      p = newPage();
    }
    const y = p.y;
    p.rect(MARGIN, y - 4, CONTENT_WIDTH, LINE_HEIGHT + 2, [0.95, 0.95, 0.93]);
    let x = MARGIN;
    block.headers.forEach((h, c) => {
      p.text(h, {
        x,
        width: widths[c],
        align: numeric.has(c) ? "end" : "start",
        color: MUTED,
        size: FONT_SIZE - 0.5,
      });
      x += widths[c];
    });
    // `text` advanced y once per line; the header is a single line.
    p.ops.push(`${RULE.join(" ")} RG 0.5 w ${MARGIN} ${(y - 5).toFixed(2)} m ${(MARGIN + CONTENT_WIDTH).toFixed(2)} ${(y - 5).toFixed(2)} l S`);
    p.y = y - LINE_HEIGHT - 4;
    return p;
  };

  page = drawHeader(page);

  for (const row of block.rows) {
    const cells = Array.from({ length: columns }, (_, c) => row[c] ?? "");
    const wrapped = cells.map((v, c) => wrap(isRtl(v) ? shapeParagraph(v) : v, FONT_SIZE, widths[c]));
    const rowLines = Math.max(...wrapped.map((w) => w.length));
    const height = rowLines * LINE_HEIGHT;

    if (page.remaining < height + LINE_HEIGHT) {
      page = newPage();
      page = drawHeader(page);
    }

    const top = page.y;
    let x = MARGIN;
    wrapped.forEach((lines, c) => {
      lines.forEach((line, i) => {
        const w = measure(line, FONT_SIZE);
        const rtl = isRtl(cells[c]);
        const toEnd = numeric.has(c) || rtl;
        const tx = toEnd ? x + widths[c] - w - 2 : x + 2;
        page.ops.push(
          `BT /F1 ${FONT_SIZE} Tf ${INK.join(" ")} rg ` +
            `${tx.toFixed(2)} ${(top - FONT_SIZE - i * LINE_HEIGHT).toFixed(2)} Td <${hexGlyphs(line)}> Tj ET`,
        );
      });
      x += widths[c];
    });
    page.y = top - height;
    page.ops.push(`${RULE.join(" ")} RG 0.4 w ${MARGIN} ${page.y.toFixed(2)} m ${(MARGIN + CONTENT_WIDTH).toFixed(2)} ${page.y.toFixed(2)} l S`);
    page.y -= 4;
  }

  return page;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/** Builds a complete PDF. */
export function buildPdf(params: { title: string; blocks: PdfBlock[]; now?: Date }): Uint8Array {
  const now = params.now ?? new Date();
  const pages: Page[] = [];
  let page = new Page(1);
  pages.push(page);

  const newPage = (): Page => {
    const next = new Page(pages.length + 1);
    pages.push(next);
    return next;
  };

  for (const block of params.blocks) {
    switch (block.type) {
      case "title": {
        page.text(block.text, { size: 22, color: ACCENT });
        page.y -= 4;
        page.line(MARGIN, page.y, PAGE_WIDTH - MARGIN, page.y, ACCENT);
        page.y -= 14;
        break;
      }
      case "heading": {
        const level = block.level ?? 1;
        if (page.remaining < LINE_HEIGHT * 3) page = newPage();
        page.y -= level === 1 ? 12 : 8;
        page.text(block.text, { size: HEADING_SIZES[level], color: level === 1 ? ACCENT : INK });
        page.y -= 4;
        break;
      }
      case "paragraph":
        page.text(block.text);
        page.y -= 6;
        break;
      case "bullets":
      case "numbers": {
        block.items.forEach((item, i) => {
          const marker = block.type === "numbers" ? `${i + 1}. ` : "•  ";
          page.text(`${marker}${item}`, { width: CONTENT_WIDTH - 18, x: MARGIN + 18 });
        });
        page.y -= 6;
        break;
      }
      case "table":
        page = drawTable(page, block, newPage);
        page.y -= 8;
        break;
      case "note":
        page.text(block.text, { color: MUTED, size: FONT_SIZE - 0.5 });
        page.y -= 6;
        break;
      case "spacer":
        page.y -= 10;
        break;
      case "pageBreak":
        page = newPage();
        break;
    }
  }

  // Footer with the page number and the generation date, drawn last so it sits
  // on top of the content layer.
  const stamp = now.toISOString().slice(0, 10);
  pages.forEach((p, i) => {
    p.line(MARGIN, MARGIN - 10, PAGE_WIDTH - MARGIN, MARGIN - 10, RULE);
    p.ops.push(
      `BT /F1 8 Tf ${MUTED.join(" ")} rg ${MARGIN} ${(MARGIN - 24).toFixed(2)} Td <${hexGlyphs(escapePdfText(stamp))}> Tj ET`,
    );
    const label = `${i + 1} / ${pages.length}`;
    const w = measure(label, 8);
    p.ops.push(
      `BT /F1 8 Tf ${MUTED.join(" ")} rg ${(PAGE_WIDTH - MARGIN - w).toFixed(2)} ${(MARGIN - 24).toFixed(2)} Td <${hexGlyphs(label)}> Tj ET`,
    );
  });

  // --- assemble the file -----------------------------------------------------
  const encoder = new TextEncoder();
  const latin = new TextDecoder("latin1");

  const objectsOut: Uint8Array[] = [];
  // Object bodies are collected whole, so the xref offsets line up one-to-one
  // with object numbers. Tracking them per array element instead would point
  // every entry at the wrong byte.
  const pushObj = (id: number, body: string | Uint8Array) => {
    const head = encoder.encode(`${id} 0 obj\n`);
    const tail = encoder.encode("\nendobj\n");
    // Binary payloads (the embedded font) must be written byte-for-byte, so
    // they are carried as a latin1 string — every byte 0..255 survives a
    // round-trip through TextEncoder, which UTF-8 would not do.
    const mid =
      typeof body === "string"
        ? encoder.encode(body)
        : encoder.encode(latin.decode(body));
    objectsOut.push(concat([head, mid, tail]));
  };

  const pageIds = pages.map((_, i) => 3 + i * 1);
  const contentIds = pages.map((_, i) => 3 + pages.length + i);

  // 1 catalog, 2 pages tree, 3.. pages, then contents, then font objects.
  const fontId = contentIds[contentIds.length - 1] + 1;
  const descriptorId = fontId + 1;
  const cidFontId = fontId + 2;
  const cmapId = fontId + 3;
  const ttfId = fontId + 4;

  pushObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  pushObj(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  );
  pages.forEach((p, i) => {
    pushObj(
      pageIds[i],
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`,
    );
  });
  pages.forEach((p, i) => {
    const stream = p.ops.join("\n");
    pushObj(contentIds[i], `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });

  const scale = (v: number) => Math.round((v / PDF_FONT_UPEM) * 1000);
  const ttf = Buffer.from(PDF_FONT_BASE64, "base64");

  pushObj(
    fontId,
    `<< /Type /Font /Subtype /Type0 /BaseFont /PWReport /Encoding /Identity-H ` +
      `/DescendantFonts [${cidFontId} 0 R] /ToUnicode ${cmapId} 0 R >>`,
  );
  pushObj(
    descriptorId,
    `<< /Type /FontDescriptor /FontName /PWReport /Flags 4 ` +
      `/FontBBox [${PDF_FONT_METRICS.bbox.map(scale).join(" ")}] ` +
      `/ItalicAngle ${PDF_FONT_METRICS.italicAngle} /Ascent ${scale(PDF_FONT_METRICS.ascent)} ` +
      `/Descent ${scale(PDF_FONT_METRICS.descent)} /CapHeight ${scale(PDF_FONT_METRICS.capHeight)} ` +
      `/StemV 80 /FontFile2 ${ttfId} 0 R >>`,
  );
  pushObj(
    cidFontId,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /PWReport /CIDSystemInfo ` +
      `<< /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
      `/FontDescriptor ${descriptorId} 0 R /DW 1000 /W [${widthArray()}] ` +
      `/CIDToGIDMap /Identity >>`,
  );
  pushObj(cmapId, toUnicodeStream(encoder));
  pushObj(ttfId, `<< /Length ${ttf.length} /Length1 ${ttf.length} >>\nstream\n${latin.decode(ttf)}\nendstream`);

  const header = encoder.encode("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
  const chunks: Uint8Array[] = [header];
  let offset = header.length;
  const offsets: number[] = [];
  for (const part of objectsOut) {
    offsets.push(offset);
    chunks.push(part);
    offset += part.length;
  }
  const maxObj = ttfId;
  const xrefStart = offset;
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxObj; i += 1) {
    xref += `${String(offsets[i - 1] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));

  return concat(chunks);
}

/**
 * `/W` array: run-length encoded widths, `startCid [w w w ...]`.
 *
 * Grouping by width alone would emit non-contiguous runs, which the format
 * cannot express, so the glyph ids are sorted and cut into runs that are
 * contiguous *and* share a width.
 */
function widthArray(): string {
  const byGid = new Map<number, number>();
  for (const [, gid, width] of PDF_FONT_ENTRIES) {
    if (!byGid.has(gid)) byGid.set(gid, width);
  }
  const gids = [...byGid.keys()].sort((a, b) => a - b);
  if (gids.length === 0) return "";

  const parts: string[] = [];
  let start = gids[0];
  let prev = gids[0];
  let width = byGid.get(gids[0]) ?? 0;

  const flush = (endGid: number, runWidth: number) => {
    const count = endGid - start + 1;
    parts.push(
      `${start} [${Array.from({ length: count }, () => scaleWidth(runWidth)).join(" ")}]`,
    );
  };

  for (let i = 1; i < gids.length; i += 1) {
    const gid = gids[i];
    const gidWidth = byGid.get(gid) ?? 0;
    if (gid === prev + 1 && gidWidth === width) {
      prev = gid;
      continue;
    }
    flush(prev, width);
    start = gid;
    prev = gid;
    width = gidWidth;
  }
  flush(prev, width);
  return parts.join(" ");
}

function scaleWidth(width: number): number {
  return Math.round((width / PDF_FONT_UPEM) * 1000);
}

/** `/ToUnicode` CMap so copy-paste and search recover the real characters. */
function toUnicodeStream(encoder: TextEncoder): string {
  const byGid = new Map<number, number>();
  for (const [cp, gid] of PDF_FONT_ENTRIES) {
    if (!byGid.has(gid)) byGid.set(gid, cp);
  }
  const gids = [...byGid.keys()].sort((a, b) => a - b);
  const chunks: string[] = [];
  for (let i = 0; i < gids.length; i += 100) {
    const slice = gids.slice(i, i + 100);
    const body = slice
      .map((gid) => {
        const cp = byGid.get(gid) ?? 0;
        return `<${gid.toString(16).padStart(4, "0")}> <${cp.toString(16).padStart(4, "0")}>`;
      })
      .join("\n");
    chunks.push(`${slice.length} beginbfchar\n${body}\nendbfchar`);
  }
  const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <ffff>
endcodespacerange
${chunks.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
  return `<< /Length ${encoder.encode(cmap).length} >>\nstream\n${cmap}\nendstream`;
}
