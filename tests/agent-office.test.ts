import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import {
  htmlToMarkdown,
  parseMarkdown,
  renderOfficeFormat,
  toCsv,
  toPdfBlocks,
  toSheets,
} from "@/lib/agent/office";

/** Reads one part out of a deflated zip, which the raw bytes cannot reveal. */
function zipPart(zip: Buffer, name: string): string | null {
  const signature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  let cursor = 0;
  while (true) {
    const at = zip.indexOf(signature, cursor);
    if (at < 0) return null;
    const method = zip.readUInt16LE(at + 8);
    const size = zip.readUInt32LE(at + 18);
    const nameLen = zip.readUInt16LE(at + 26);
    const extraLen = zip.readUInt16LE(at + 28);
    const entryName = zip.subarray(at + 30, at + 30 + nameLen).toString("utf8");
    const dataStart = at + 30 + nameLen + extraLen;
    const data = zip.subarray(dataStart, dataStart + size);
    if (entryName === name) {
      return method === 8 ? inflateRawSync(data).toString("utf8") : data.toString("utf8");
    }
    cursor = dataStart + size;
  }
}

const MD = `# تقرير مبيعات

## نظرة عامة

- **الإيرادات**: 4,250.00 EGP

إجمالي 4250.00 EGP من 12 طلب.

## الأصناف

| الصنف | الكمية | الإيراد |
| --- | --- | --- |
| combo | 6 | 2040.00 EGP |

1. راجع الأسعار.

_ملاحظة من البيانات الحية._
`;

describe("markdown parsing", () => {
  it("classifies every block type", () => {
    const types = parseMarkdown(MD).map((b) => b.type);
    expect(types).toEqual([
      "heading",
      "heading",
      "bullets",
      "paragraph",
      "heading",
      "table",
      "numbers",
      "note",
    ]);
  });

  it("keeps table cells aligned", () => {
    const table = parseMarkdown(MD).find((b) => b.type === "table");
    expect(table).toBeDefined();
    if (table?.type !== "table") throw new Error("no table");
    expect(table.headers).toEqual(["الصنف", "الكمية", "الإيراد"]);
    expect(table.rows).toEqual([["combo", "6", "2040.00 EGP"]]);
  });

  it("strips inline emphasis", () => {
    const bullet = parseMarkdown(MD).find((b) => b.type === "bullets");
    if (bullet?.type !== "bullets") throw new Error("no bullets");
    expect(bullet.items[0]).toBe("الإيرادات: 4,250.00 EGP");
  });

  it("drops the leading H1 in the PDF, which draws its own title", () => {
    const blocks = toPdfBlocks(MD, "تقرير مبيعات");
    expect(blocks[0]).toEqual({ type: "title", text: "تقرير مبيعات" });
    const headings = blocks.filter((b) => b.type === "heading");
    // Only the two `##` sections remain.
    expect(headings).toHaveLength(2);
  });
});

describe("workbook conversion", () => {
  it("puts prose on a Report sheet and each table on its own", () => {
    const sheets = toSheets(MD, "تقرير مبيعات");
    expect(sheets.map((s) => s.name)).toEqual(["Report", "الصنف"]);
  });

  it("writes money columns as numbers, not text", () => {
    const sheets = toSheets(MD, "تقرير مبيعات");
    const table = sheets.find((s) => s.name === "الصنف");
    if (!table) throw new Error("no table sheet");
    // "6" and "2040.00 EGP" become numeric cells so they can be summed.
    expect(table.rows[1]).toEqual(["combo", 6, 2040]);
    expect(table.moneyColumns).toEqual([1, 2]);
    expect(table.freezeHeader).toBe(true);
  });

  it("exports the first table as CSV", () => {
    expect(toCsv(MD)).toBe("الصنف,الكمية,الإيراد\ncombo,6,2040.00 EGP");
  });
});

describe("office bytes", () => {
  const bytes = (format: "pdf" | "docx" | "xlsx") =>
    renderOfficeFormat(format, MD, "تقرير مبيعات");

  it("writes a PDF with the right signature and a trailer", () => {
    const pdf = bytes("pdf");
    expect(Buffer.from(pdf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const tail = Buffer.from(pdf.slice(-32)).toString("latin1");
    expect(tail).toContain("%%EOF");
    // The font is embedded, which is what makes the Arabic render.
    const text = Buffer.from(pdf).toString("latin1");
    expect(text).toContain("/FontFile2");
    expect(text).toContain("/Type0");
  });

  it("writes a docx as a zip with the document part", () => {
    const docx = Buffer.from(bytes("docx"));
    expect(docx.slice(0, 2).toString("latin1")).toBe("PK");
    const documentXml = zipPart(docx, "word/document.xml");
    expect(documentXml).toBeTruthy();
    // RTL is set as a property, not by reversing the text.
    expect(documentXml).toContain("<w:bidi/>");
    expect(documentXml).toContain("<w:bidiVisual/>");
  });

  it("writes an xlsx as a zip with RTL sheets", () => {
    const xlsx = Buffer.from(bytes("xlsx"));
    expect(xlsx.slice(0, 2).toString("latin1")).toBe("PK");
    expect(zipPart(xlsx, "xl/workbook.xml")).toBeTruthy();
    // rightToLeft is what makes Excel draw column A on the right.
    const sheet = zipPart(xlsx, "xl/worksheets/sheet1.xml");
    expect(sheet).toContain('rightToLeft="1"');
  });
});

describe("html deliverables to markdown", () => {
  it("converts KPI tiles, tables and notes", () => {
    const html = `<html dir="rtl"><head><style>x{}</style></head><body>
      <h1>لوحة المبيعات</h1>
      <div class="kpis"><div class="kpi"><div class="label">الإيرادات</div><div class="value">4,250.00 EGP</div></div><div class="kpi"><div class="label">الطلبات</div><div class="value">12</div></div></div>
      <section><h2>أعلى الأصناف</h2><svg><path d="M0 0"/></svg>
      <table><thead><tr><th>الصنف</th><th class="num">الإيراد</th></tr></thead><tbody><tr><td>combo</td><td class="num">2,040.00 EGP</td></tr></tbody></table>
      <div class="note">من الطلبات المكتملة فقط.</div></section></body></html>`;
    const md = htmlToMarkdown(html);
    // Both KPI tiles survive: matching the wrapper once would drop the second.
    expect(md).toContain("- **الإيرادات**: 4,250.00 EGP");
    expect(md).toContain("- **الطلبات**: 12");
    expect(md).toContain("## أعلى الأصناف");
    expect(md).toContain("| الصنف | الإيراد |");
    expect(md).toContain("| combo | 2,040.00 EGP |");
    expect(md).toContain("_من الطلبات المكتملة فقط._");
    // Charts cannot travel into a spreadsheet; the SVG is dropped.
    expect(md).not.toContain("<svg");
  });
});
