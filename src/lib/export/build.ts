import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";

/**
 * Dataset definitions behind the export centre. Each entry names a real table,
 * the columns that leave the building and the ordering, so an export is a
 * faithful dump of one table rather than a hand-assembled report.
 */
export type ExportDataset =
  | "users"
  | "orders"
  | "order_items"
  | "feedback"
  | "loyalty"
  | "menu"
  | "stock"
  | "activity"
  | "analytics"
  | "ai_usage"
  | "segments";

type DatasetSpec = {
  table: string;
  columns: string;
  orderBy: string;
  label: string;
};

const DATASETS: Record<ExportDataset, DatasetSpec> = {
  users: {
    table: "profiles",
    columns:
      "id, full_name, phone, email, marketing_opt_in, is_blocked, created_at, last_seen_at",
    orderBy: "created_at",
    label: "Customer profiles",
  },
  orders: {
    table: "orders",
    columns:
      "id, order_number, user_id, status, fulfillment, payment_method, payment_status, subtotal, discount_total, delivery_fee, tax_total, total, created_at, updated_at",
    orderBy: "created_at",
    label: "Orders",
  },
  order_items: {
    table: "order_items",
    columns:
      "id, order_id, menu_item_id, name_snapshot, unit_price, quantity, line_total",
    orderBy: "id",
    label: "Order items",
  },
  feedback: {
    table: "feedback",
    columns:
      "id, user_id, order_id, rating, category, title, message, status, admin_response, responded_at, created_at",
    orderBy: "created_at",
    label: "Feedback",
  },
  loyalty: {
    table: "loyalty_transactions",
    columns: "id, user_id, order_id, type, points, reason, expires_at, created_at",
    orderBy: "created_at",
    label: "Loyalty ledger",
  },
  menu: {
    table: "menu_items",
    columns:
      "id, category_id, slug, name_en, name_ar, description_en, price, compare_at_price, is_available, is_featured, is_spicy, is_vegetarian, is_vegan, contains_nuts, prep_minutes, calories, sort_order, is_archived, created_at, updated_at",
    orderBy: "name_en",
    label: "Menu items",
  },
  stock: {
    table: "stock_items",
    columns:
      "id, name_en, name_ar, unit, quantity, min_threshold, cost_per_unit, supplier, status, updated_at",
    orderBy: "name_en",
    label: "Stock items",
  },
  activity: {
    table: "activity_logs",
    columns: "id, user_id, session_id, event, entity, entity_id, metadata, created_at",
    orderBy: "created_at",
    label: "Activity logs",
  },
  analytics: {
    table: "analytics_events",
    columns: "id, session_id, user_id, event, path, referrer, device, metadata, created_at",
    orderBy: "created_at",
    label: "Analytics events",
  },
  ai_usage: {
    table: "ai_requests",
    columns:
      "id, surface, provider, model, status, latency_ms, prompt_tokens, completion_tokens, created_at",
    orderBy: "created_at",
    label: "AI requests",
  },
  segments: {
    table: "profiles",
    columns: "id, full_name, phone, email, created_at, last_seen_at",
    orderBy: "created_at",
    label: "CRM segments",
  },
};

export function isExportDataset(value: string): value is ExportDataset {
  return Object.prototype.hasOwnProperty.call(DATASETS, value);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Quote when the value carries a delimiter, a quote or a newline. Spreadsheet
  // apps and Excel both unquote doubled quotes correctly.
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Builds the dataset in memory and returns the bytes plus the row count.
 * Row-level reads use the service role because a caller holding
 * `exports.manage` is authorised for the whole table; the capability check
 * happens before this function is reached.
 */
export async function buildExport(params: {
  dataset: ExportDataset;
  format: "csv" | "json";
}): Promise<{ body: string; rows: number; mime: string; extension: string }> {
  const spec = DATASETS[params.dataset];
  const admin = createAdminSupabase();

  const { data, error } = await admin
    .from(spec.table as never)
    .select(spec.columns)
    .order(spec.orderBy as never, { ascending: false });

  if (error) {
    throw new Error(`Export of ${params.dataset} failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  if (params.format === "json") {
    return {
      body: JSON.stringify(
        {
          dataset: params.dataset,
          label: spec.label,
          generated_at: new Date().toISOString(),
          row_count: rows.length,
          rows,
        },
        null,
        2,
      ),
      rows: rows.length,
      mime: "application/json",
      extension: "json",
    };
  }

  const header =
    rows.length > 0
      ? Object.keys(rows[0])
      : spec.columns.split(",").map((column) => column.trim());
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((column) => csvCell(row[column])).join(","));
  }

  return {
    body: `${lines.join("\r\n")}\r\n`,
    rows: rows.length,
    mime: "text/csv; charset=utf-8",
    extension: "csv",
  };
}

/** Storage object path for one export, so the dashboard can deep-link it. */
export function exportObjectPath(exportId: string, extension: string) {
  return `${exportId}.${extension}`;
}
