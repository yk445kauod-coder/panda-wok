import "server-only";

import { buildWorkbook, type Sheet, type SheetRow } from "@/lib/agent/xlsx";
import { formatNumber } from "@/lib/utils/format";

/**
 * Readable renderings of a backup bundle.
 *
 * The JSON bundle stays the restore-faithful artefact; these are for a human to
 * open. The workbook puts one table per sheet with a real header row; the text
 * report is a scannable summary (table names and counts) followed by a preview
 * of each table's first rows.
 */

export type BackupTables = Record<string, { rows: unknown[]; count: number; capped: boolean }>;

/** A short, stable sheet name per table (Excel caps at 31 chars). */
function sheetName(table: string): string {
  return table.slice(0, 31);
}

function cellValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function tableSheet(table: string, rows: unknown[]): Sheet {
  const objects = rows as Record<string, unknown>[];
  const columns =
    objects.length > 0 ? Object.keys(objects[0]) : [];
  const header: SheetRow = columns.map((column) => column);
  const body: SheetRow[] = objects.map((row) =>
    columns.map((column) => cellValue(row[column])),
  );
  return {
    name: sheetName(table),
    rows: [header, ...body],
    freezeHeader: true,
    widths: columns.map(() => 20),
  };
}

export function buildBackupXlsx(params: {
  tables: BackupTables;
  kind: string;
  generatedAt: string;
}): Uint8Array {
  const names = Object.keys(params.tables);
  const sheets: Sheet[] = names.map((name) =>
    tableSheet(name, params.tables[name]?.rows ?? []),
  );
  if (sheets.length === 0) {
    sheets.push({ name: "Empty", rows: [["No tables were captured."]] });
  }
  return buildWorkbook(sheets, new Date(params.generatedAt));
}

const PREVIEW_ROWS = 12;

export function buildBackupTxt(params: {
  tables: BackupTables;
  kind: string;
  label: string | null;
  generatedAt: string;
}): string {
  const names = Object.keys(params.tables);
  const lines: string[] = [
    `Panda Wok — backup (${params.kind})`,
    params.label ? `Label: ${params.label}` : "",
    `Generated: ${params.generatedAt}`,
    `Tables: ${names.length}`,
    "",
    "Table                      Rows      Capped",
    "-------------------------  --------  ------",
  ].filter(Boolean);

  for (const name of names) {
    const table = params.tables[name];
    lines.push(
      `${name.padEnd(25)}  ${String(formatNumber(table.count)).padEnd(8)}  ${
        table.capped ? "yes" : "no"
      }`,
    );
  }

  for (const name of names) {
    const table = params.tables[name];
    const rows = (table.rows as Record<string, unknown>[]).slice(0, PREVIEW_ROWS);
    if (rows.length === 0) continue;

    lines.push("", `── ${name} (first ${rows.length} of ${table.count}) ──`);
    const columns = Object.keys(rows[0]);
    lines.push(columns.join(" | "));
    for (const row of rows) {
      lines.push(columns.map((column) => String(cellValue(row[column]) ?? "")).join(" | "));
    }
  }

  return `${lines.join("\n")}\n`;
}
