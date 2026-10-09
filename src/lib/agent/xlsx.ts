import "server-only";

import { columnName, xmlEscape, xmlText, zip, type ZipEntry } from "@/lib/agent/ooxml";
import { isRtl } from "@/lib/agent/arabic";

/**
 * Real `.xlsx` workbooks, written directly.
 *
 * A spreadsheet has to be a spreadsheet: the owner asked for Excel, and a CSV
 * renamed `.xls` is not one — Excel warns, the RTL column order is lost, and
 * the numbers arrive as text so nothing can be summed. This writes the OOXML
 * parts Excel and Google Sheets both open.
 *
 * Two details that matter for an Arabic-first console:
 *  - text is inline (`inlineStr`) rather than a shared-string table, which keeps
 *    the writer simple and avoids a second part to keep in sync;
 *  - numbers are written as numbers with `numFmtId` 4 (`#,##0.00`) so a money
 *    column is a money column, not a string.
 */

export type SheetCell = string | number | null | undefined;
export type SheetRow = SheetCell[];

export type Sheet = {
  name: string;
  rows: SheetRow[];
  /** Zero-based indices of columns to render as money (`#,##0.00`). */
  moneyColumns?: number[];
  /** Column widths in Excel's character units. */
  widths?: number[];
  /** Freeze the first row (a header) when true. */
  freezeHeader?: boolean;
};

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Excel sheet names cannot contain : \ / ? * [ ] and cap at 31 characters. */
function sheetName(name: string, index: number): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned.length > 0 ? cleaned : `Sheet${index + 1}`;
}

function cellXml(ref: string, value: SheetCell, money: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    // numFmtId 4 is the built-in #,##0.00; 0 is General.
    const style = money ? ' s="1"' : "";
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  // `xml:space="preserve"` keeps leading/trailing spaces in a dish name.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

/** True when the sheet reads right-to-left, decided by its own content. */
function isRtlSheet(sheet: Sheet): boolean {
  const text = sheet.rows
    .slice(0, 25)
    .flat()
    .filter((c): c is string => typeof c === "string")
    .join(" ");
  return isRtl(text);
}

function sheetXml(sheet: Sheet): string {
  const money = new Set(sheet.moneyColumns ?? []);
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => cellXml(`${columnName(c)}${r + 1}`, value, money.has(c)))
        .join("");
      return cells ? `<row r="${r + 1}">${cells}</row>` : `<row r="${r + 1}"/>`;
    })
    .join("");

  const cols =
    sheet.widths && sheet.widths.length > 0
      ? `<cols>${sheet.widths
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join("")}</cols>`
      : "";

  const pane = sheet.freezeHeader
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    : "";
  // `rightToLeft` makes Excel draw column A at the right edge, which is what an
  // Arabic reader expects; without it an Arabic sheet reads back to front.
  const rtl = isRtlSheet(sheet) ? ' rightToLeft="1"' : "";
  const views = `<sheetViews><sheetView workbookViewId="0"${rtl}>${pane}</sheetView></sheetViews>`;

  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const CONTENT_TYPES = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
{sheetOverrides}
</Types>`;

const ROOT_RELS = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
{sheetRels}
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

function workbookXml(sheets: Sheet[]): string {
  const entries = sheets
    .map(
      (s, i) =>
        `<sheet name="${xmlEscape(sheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("");
  return `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${entries}</sheets></workbook>`;
}

/** Builds a complete `.xlsx` file. */
export function buildWorkbook(sheets: Sheet[], now = new Date()): Uint8Array {
  if (sheets.length === 0) throw new Error("A workbook needs at least one sheet.");

  const parts: ZipEntry[] = [
    { name: "[Content_Types].xml", data: CONTENT_TYPES.replace(
      "{sheetOverrides}",
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join(""),
    ) },
    { name: "_rels/.rels", data: ROOT_RELS },
    { name: "xl/workbook.xml", data: workbookXml(sheets) },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: WORKBOOK_RELS.replace(
        "{sheetRels}",
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join(""),
      ),
    },
    { name: "xl/styles.xml", data: STYLES },
  ];

  sheets.forEach((sheet, i) => {
    parts.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet) });
  });

  return zip(parts, now);
}
