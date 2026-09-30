import "server-only";

import { xmlEscape, xmlText, zip, type ZipEntry } from "@/lib/agent/ooxml";

/**
 * Real `.docx` documents.
 *
 * A Word file is a ZIP of XML parts, like the workbook. The owner asked for
 * docs and this produces one a person can open, edit and print — with a real
 * table for the numbers, not a wall of monospaced text in a `.txt`.
 *
 * RTL is set properly rather than by reversing the string: `<w:bidi/>` on the
 * paragraph and `<w:bidiVisual/>` on the table make Word lay the document out
 * right-to-left, so an Arabic report reads correctly and the columns run from
 * the right edge.
 */

export type DocBlock =
  | { type: "heading"; text: string; level?: 1 | 2 | 3 }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbers"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "note"; text: string }
  | { type: "pageBreak" };

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** Calibri for Latin, Arial for complex scripts (Arabic) — both ubiquitous. */
const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"/>';

function run(text: string, opts: { bold?: boolean; italic?: boolean; size?: number } = {}): string {
  const props = [
    FONTS,
    opts.bold ? "<w:b/><w:bCs/>" : "",
    opts.italic ? "<w:i/>" : "",
    opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : "",
  ].join("");
  // `xml:space="preserve"` keeps intentional spacing inside a cell.
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

function para(
  content: string,
  opts: { style?: string; bidi?: boolean; indent?: boolean; spacing?: number } = {},
): string {
  const props = [
    opts.style ? `<w:pStyle w:val="${opts.style}"/>` : "",
    opts.bidi === false ? "" : "<w:bidi/>",
    opts.indent ? '<w:ind w:start="360" w:hanging="360"/>' : "",
    opts.spacing ? `<w:spacing w:before="${opts.spacing}"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${props}</w:pPr>${content}</w:p>`;
}

function tableBlock(headers: string[], rows: string[][]): string {
  const border =
    '<w:tblBorders>' +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="C9C6BC"/>`)
      .join("") +
    "</w:tblBorders>";

  const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers
    .map((h) => `<w:tc><w:tcPr/><w:p><w:pPr><w:bidi/></w:pPr>${run(h, { bold: true })}</w:p></w:tc>`)
    .join("")}</w:tr>`;

  const bodyRows = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((cell) => `<w:tc><w:tcPr/><w:p><w:pPr><w:bidi/></w:pPr>${run(cell)}</w:p></w:tc>`)
          .join("")}</w:tr>`,
    )
    .join("");

  // bidiVisual makes the first column render at the right edge in RTL.
  return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="0" w:type="auto"/>${border}</w:tblPr>${headerRow}${bodyRows}</w:tbl>${para("")}`;
}

function blockXml(block: DocBlock): string {
  switch (block.type) {
    case "heading": {
      const level = block.level ?? 1;
      return para(run(block.text, { bold: true, size: level === 1 ? 32 : level === 2 ? 26 : 22 }), {
        style: `Heading${level}`,
        spacing: 240,
      });
    }
    case "paragraph":
      return para(run(block.text));
    case "bullets":
      return block.items.map((i) => para(run(`•\t${i}`), { indent: true })).join("");
    case "numbers":
      return block.items.map((i, n) => para(run(`${n + 1}.\t${i}`), { indent: true })).join("");
    case "table":
      return tableBlock(block.headers, block.rows);
    case "note":
      return para(run(block.text, { italic: true }), { style: "Quote" });
    case "pageBreak":
      return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    default:
      return "";
  }
}

const STYLES = `${XML_HEADER}<w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr>${FONTS}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/></w:style>
</w:styles>`;

const CONTENT_TYPES = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const DOC_RELS = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * Builds a complete `.docx`. `title` becomes a real document title property so
 * the file is named correctly in a reader's recent-files list.
 */
export function buildDocx(params: {
  title: string;
  blocks: DocBlock[];
  dir?: "rtl" | "ltr";
  now?: Date;
}): Uint8Array {
  const now = params.now ?? new Date();
  const body = params.blocks.map(blockXml).join("");
  const documentXml = `${XML_HEADER}<w:document ${W_NS}><w:body>${body}<w:sectPr><w:bidi/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;

  const core = `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEscape(params.title)}</dc:title><dc:creator>Panda Wok</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now.toISOString()}</dcterms:created>
</cp:coreProperties>`;

  const parts: ZipEntry[] = [
    { name: "[Content_Types].xml", data: CONTENT_TYPES },
    { name: "_rels/.rels", data: ROOT_RELS },
    { name: "word/document.xml", data: documentXml },
    { name: "word/_rels/document.xml.rels", data: DOC_RELS },
    { name: "word/styles.xml", data: STYLES },
    { name: "docProps/core.xml", data: core },
  ];

  return zip(parts, now);
}
