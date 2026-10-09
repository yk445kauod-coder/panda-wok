import "server-only";

import { buildWorkbook, type Sheet, type SheetCell } from "@/lib/agent/xlsx";
import type { ExportDataset } from "@/lib/export/build";

/**
 * Renders one dataset as a readable workbook or text report.
 *
 * The point is legibility for a human, not a byte dump: money columns are real
 * numbers with a currency format (so they sum), dates read as dates, and a TXT
 * report is laid out in aligned columns with a header and a summary. The raw
 * JSON export still exists for a faithful copy.
 */

export type ExportColumn = {
  key: string;
  label: string;
  kind: "text" | "number" | "money" | "date";
};

/** Human column labels and types per dataset, in the order a reader scans them. */
const COLUMNS: Record<ExportDataset, ExportColumn[]> = {
  users: [
    { key: "full_name", label: "Name", kind: "text" },
    { key: "phone", label: "Phone", kind: "text" },
    { key: "email", label: "Email", kind: "text" },
    { key: "marketing_opt_in", label: "Marketing opt-in", kind: "text" },
    { key: "is_blocked", label: "Blocked", kind: "text" },
    { key: "created_at", label: "Joined", kind: "date" },
    { key: "last_seen_at", label: "Last seen", kind: "date" },
  ],
  orders: [
    { key: "order_number", label: "Order", kind: "text" },
    { key: "status", label: "Status", kind: "text" },
    { key: "fulfillment", label: "Fulfillment", kind: "text" },
    { key: "payment_method", label: "Payment", kind: "text" },
    { key: "payment_status", label: "Payment status", kind: "text" },
    { key: "subtotal", label: "Subtotal", kind: "money" },
    { key: "discount_total", label: "Discount", kind: "money" },
    { key: "delivery_fee", label: "Delivery", kind: "money" },
    { key: "tax_total", label: "Tax", kind: "money" },
    { key: "total", label: "Total", kind: "money" },
    { key: "created_at", label: "Placed", kind: "date" },
  ],
  order_items: [
    { key: "order_id", label: "Order id", kind: "text" },
    { key: "name_snapshot", label: "Item", kind: "text" },
    { key: "quantity", label: "Qty", kind: "number" },
    { key: "unit_price", label: "Unit price", kind: "money" },
    { key: "line_total", label: "Line total", kind: "money" },
  ],
  feedback: [
    { key: "rating", label: "Rating", kind: "number" },
    { key: "category", label: "Category", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "message", label: "Message", kind: "text" },
    { key: "status", label: "Status", kind: "text" },
    { key: "admin_response", label: "Reply", kind: "text" },
    { key: "created_at", label: "Submitted", kind: "date" },
  ],
  loyalty: [
    { key: "type", label: "Type", kind: "text" },
    { key: "points", label: "Points", kind: "number" },
    { key: "reason", label: "Reason", kind: "text" },
    { key: "expires_at", label: "Expires", kind: "date" },
    { key: "created_at", label: "When", kind: "date" },
  ],
  menu: [
    { key: "name_en", label: "Dish (English)", kind: "text" },
    { key: "name_ar", label: "Dish (Arabic)", kind: "text" },
    { key: "slug", label: "Slug", kind: "text" },
    { key: "price", label: "Price", kind: "money" },
    { key: "compare_at_price", label: "Compare at", kind: "money" },
    { key: "is_available", label: "Available", kind: "text" },
    { key: "is_archived", label: "Archived", kind: "text" },
    { key: "created_at", label: "Created", kind: "date" },
  ],
  stock: [
    { key: "name_en", label: "Item", kind: "text" },
    { key: "unit", label: "Unit", kind: "text" },
    { key: "quantity", label: "Quantity", kind: "number" },
    { key: "min_threshold", label: "Reorder at", kind: "number" },
    { key: "cost_per_unit", label: "Cost / unit", kind: "money" },
    { key: "supplier", label: "Supplier", kind: "text" },
    { key: "status", label: "Status", kind: "text" },
  ],
  activity: [
    { key: "event", label: "Event", kind: "text" },
    { key: "entity", label: "Entity", kind: "text" },
    { key: "entity_id", label: "Entity id", kind: "text" },
    { key: "created_at", label: "When", kind: "date" },
  ],
  analytics: [
    { key: "event", label: "Event", kind: "text" },
    { key: "path", label: "Path", kind: "text" },
    { key: "device", label: "Device", kind: "text" },
    { key: "referrer", label: "Referrer", kind: "text" },
    { key: "created_at", label: "When", kind: "date" },
  ],
  ai_usage: [
    { key: "surface", label: "Surface", kind: "text" },
    { key: "provider", label: "Provider", kind: "text" },
    { key: "model", label: "Model", kind: "text" },
    { key: "status", label: "Status", kind: "text" },
    { key: "latency_ms", label: "Latency (ms)", kind: "number" },
    { key: "prompt_tokens", label: "Prompt tokens", kind: "number" },
    { key: "completion_tokens", label: "Completion tokens", kind: "number" },
    { key: "created_at", label: "When", kind: "date" },
  ],
  segments: [
    { key: "full_name", label: "Name", kind: "text" },
    { key: "phone", label: "Phone", kind: "text" },
    { key: "email", label: "Email", kind: "text" },
    { key: "created_at", label: "Joined", kind: "date" },
    { key: "last_seen_at", label: "Last seen", kind: "date" },
  ],
};

export function columnsFor(dataset: ExportDataset): ExportColumn[] {
  return COLUMNS[dataset];
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace("T", " ").slice(0, 19);
}

/** A cell as a spreadsheet value: numbers stay numbers, everything else text. */
function cellFor(value: unknown, kind: ExportColumn["kind"]): SheetCell {
  if (value === null || value === undefined) return "";
  if (kind === "money" || kind === "number") return asNumber(value);
  if (kind === "date") return formatDate(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** A cell as display text for the TXT report. */
function textFor(value: unknown, kind: ExportColumn["kind"]): string {
  if (value === null || value === undefined || value === "") return "";
  if (kind === "date") return formatDate(value);
  if (kind === "money") {
    const n = asNumber(value);
    return n === null ? String(value) : n.toFixed(2);
  }
  if (kind === "number") {
    const n = asNumber(value);
    return n === null ? String(value) : String(n);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function buildXlsx(params: {
  dataset: ExportDataset;
  label: string;
  rows: Record<string, unknown>[];
  generatedAt: string;
}): Uint8Array {
  const columns = COLUMNS[params.dataset];
  const moneyColumns = columns
    .map((column, index) => (column.kind === "money" ? index : -1))
    .filter((index) => index >= 0);

  const sheet: Sheet = {
    name: params.label,
    freezeHeader: true,
    moneyColumns,
    widths: columns.map((column) => (column.kind === "text" ? 24 : 14)),
    rows: [
      columns.map((column) => column.label),
      ...params.rows.map((row) => columns.map((column) => cellFor(row[column.key], column.kind))),
    ],
  };

  return buildWorkbook([sheet], new Date(params.generatedAt));
}

/** A column-aligned plain-text report. Widest cell per column sets the width. */
export function buildTxt(params: {
  dataset: ExportDataset;
  label: string;
  rows: Record<string, unknown>[];
  generatedAt: string;
}): string {
  const columns = COLUMNS[params.dataset];
  const table = params.rows.map((row) =>
    columns.map((column) => textFor(row[column.key], column.kind)),
  );

  const widths = columns.map((column, index) =>
    Math.max(
      column.label.length,
      ...table.map((line) => line[index]?.length ?? 0),
      1,
    ),
  );

  const pad = (text: string, width: number) =>
    text.length >= width ? text : text + " ".repeat(width - text.length);
  const line = (cells: string[]) =>
    cells.map((cell, index) => pad(cell, widths[index])).join("  ").trimEnd();
  const rule = widths.map((width) => "-".repeat(width)).join("  ");

  const header = [
    `Panda Wok — ${params.label}`,
    `Generated: ${params.generatedAt}`,
    `Rows: ${params.rows.length}`,
    "",
  ];

  const body = [
    line(columns.map((column) => column.label)),
    rule,
    ...table.map(line),
  ];

  return `${[...header, ...body].join("\n")}\n`;
}
