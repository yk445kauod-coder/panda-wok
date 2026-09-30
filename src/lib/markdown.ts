/**
 * Markdown parsing, shared by the chat renderer and the office exporters.
 *
 * This lives outside `office.ts` because that module is `server-only` (it pulls
 * in the binary writers), while the chat renders in the browser. Both need the
 * *same* parse, or a table would look different in chat than in the PDF of the
 * same answer.
 *
 * The markdown is produced by this codebase, so its shape is known and small:
 * `#`/`##`/`###` headings, `| … |` tables, `-` bullets, `1.` numbered steps,
 * `_note_` lines, fenced code and paragraphs. Nothing here is a general
 * CommonMark implementation, and it does not try to be one.
 *
 * Inline spans are parsed into tokens rather than string-replaced so the
 * renderer can build React nodes — `dangerouslySetInnerHTML` is never needed,
 * and a `**bold**` inside a table cell works the same as one in a paragraph.
 */

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbers"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "note"; text: string }
  | { type: "code"; language: string; text: string };

/**
 * Tokenises the inline markdown this codebase emits.
 *
 * Order matters: `code` is matched before emphasis so a literal `*` inside
 * backticks is not read as emphasis, and links are matched before bold so
 * `[**x**](url)` does not lose its target.
 */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    if (value) tokens.push({ type: "text", text: value });
  };

  while ((match = pattern.exec(text)) !== null) {
    pushText(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      tokens.push({ type: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      tokens.push({ type: "bold", text: token.slice(2, -2) });
    } else if (token.startsWith("*") || token.startsWith("_")) {
      tokens.push({ type: "italic", text: token.slice(1, -1) });
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (link) tokens.push({ type: "link", text: link[1], href: link[2] });
      else pushText(token);
    }
    last = match.index + token.length;
  }
  pushText(text.slice(last));

  return tokens.length > 0 ? tokens : [{ type: "text", text }];
}

/** Strips inline markdown to plain text, for the binary exporters. */
export function plainText(text: string): string {
  return parseInline(text)
    .map((token) => token.text)
    .join("")
    .trim();
}

/** Splits a markdown table row into cells, dropping the outer pipes. */
function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

const isSeparator = (line: string) => /^\|?[\s:|-]+\|?$/.test(line) && line.includes("-");

export function parseMarkdown(markdown: string): MdBlock[] {
  const lines = markdown.split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // A fenced block is taken verbatim — never inline-parsed.
    const fence = /^```(\w*)\s*$/.exec(line.trim());
    if (fence) {
      i += 1;
      const body: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", language: fence[1] ?? "", text: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
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
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "numbers", items });
      continue;
    }

    // A line that is entirely italic is treated as a note.
    const note = /^_(.+)_$/.exec(line.trim());
    if (note) {
      blocks.push({ type: "note", text: note[1] });
      i += 1;
      continue;
    }

    // Otherwise gather the paragraph up to the next blank line or block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s/.test(lines[i]) &&
      !/^```/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("|") &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length > 0) blocks.push({ type: "paragraph", text: para.join(" ") });
  }

  return blocks;
}

/** The first table in a document, or null — used to pick a CSV sheet. */
export function firstTable(markdown: string): Extract<MdBlock, { type: "table" }> | null {
  for (const block of parseMarkdown(markdown)) {
    if (block.type === "table") return block;
  }
  return null;
}

/** True when the text contains markdown worth rendering rather than showing raw. */
export function hasMarkdown(text: string): boolean {
  return (
    /(^|\n)#{1,3}\s/.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /(^|\n)[-*]\s/.test(text) ||
    /(^|\n)\d+[.)]\s/.test(text) ||
    /\|[^|\n]+\|/.test(text) ||
    /`[^`]+`/.test(text)
  );
}
