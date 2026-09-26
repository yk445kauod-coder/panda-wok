import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";

export type BackupKind =
  | "database"
  | "configuration"
  | "menu"
  | "media_refs"
  | "snapshot";

/**
 * Row caps per table. A backup that streams an unbounded `activity_logs` into
 * memory will take the server down, so the high-volume tables are capped and the
 * cap is recorded inside the bundle. Restores read the bundle, so the cap is
 * honest metadata rather than a silent truncation.
 */
const ROW_CAP = 5_000;

type TableSpec = { table: string; columns: string; orderBy: string; cap?: number };

const TABLES: Record<string, TableSpec> = {
  profiles: {
    table: "profiles",
    columns:
      "id, full_name, phone, email, marketing_opt_in, is_blocked, created_at, last_seen_at",
    orderBy: "created_at",
  },
  orders: {
    table: "orders",
    columns:
      "id, order_number, user_id, status, fulfillment, payment_method, payment_status, currency, subtotal, discount_total, delivery_fee, tax_total, total, created_at, updated_at",
    orderBy: "created_at",
    cap: ROW_CAP,
  },
  order_items: {
    table: "order_items",
    columns: "id, order_id, menu_item_id, name_snapshot, unit_price, quantity, line_total",
    orderBy: "id",
    cap: ROW_CAP,
  },
  categories: {
    table: "categories",
    columns: "id, slug, name_en, name_ar, description_en, image_url, sort_order, is_enabled",
    orderBy: "sort_order",
  },
  menu_items: {
    table: "menu_items",
    columns:
      "id, category_id, slug, name_en, name_ar, description_en, price, is_available, is_featured, is_archived, image_url",
    orderBy: "name_en",
  },
  stock_items: {
    table: "stock_items",
    columns: "id, name_en, name_ar, unit, quantity, min_threshold, status, updated_at",
    orderBy: "name_en",
  },
  settings: {
    table: "settings",
    columns: "key, value, description, is_public, updated_at",
    orderBy: "key",
  },
  feature_flags: {
    table: "feature_flags",
    columns: "key, label, description, module, is_enabled, sort_order, updated_at",
    orderBy: "key",
  },
  ai_providers: {
    // secret_ref only — the credential itself lives in the environment, never in
    // a backup bundle that gets downloaded.
    table: "ai_providers",
    columns: "id, name, kind, base_url, model, secret_ref, is_enabled, is_fallback, priority",
    orderBy: "priority",
  },
  ai_prompts: {
    table: "ai_prompts",
    columns: "id, key, name, system_instruction, temperature, max_tokens, is_active, updated_at",
    orderBy: "key",
  },
  loyalty_rewards: {
    table: "loyalty_rewards",
    columns: "id, name_en, name_ar, points_cost, kind, value, tier_required, is_enabled",
    orderBy: "points_cost",
  },
  upsell_rules: {
    table: "upsell_rules",
    columns:
      "id, name, trigger_kind, trigger_menu_item_id, trigger_category_id, suggest_kind, suggest_menu_item_id, suggest_category_id, discount_percent, priority, is_enabled",
    orderBy: "priority",
  },
};

/** Which tables each backup kind captures. */
const KIND_TABLES: Record<BackupKind, string[]> = {
  configuration: [
    "settings",
    "feature_flags",
    "ai_providers",
    "ai_prompts",
    "loyalty_rewards",
    "upsell_rules",
  ],
  menu: ["categories", "menu_items", "stock_items"],
  media_refs: ["menu_items"],
  database: ["profiles", "orders", "order_items", "categories", "menu_items", "stock_items"],
  snapshot: [
    "profiles",
    "orders",
    "order_items",
    "categories",
    "menu_items",
    "stock_items",
    "settings",
    "feature_flags",
    "ai_providers",
    "ai_prompts",
    "loyalty_rewards",
    "upsell_rules",
  ],
};

export type BackupBundle = {
  generated_at: string;
  kind: BackupKind;
  label: string | null;
  row_cap: number;
  tables: Record<string, { rows: unknown[]; count: number; capped: boolean }>;
  media_refs: string[];
};

/**
 * Collects the tables for one backup kind and returns the bundle plus its
 * serialised size. Service role is used because the caller already passed the
 * `backups.create` capability check.
 */
export async function buildBackup(params: {
  kind: BackupKind;
  label: string | null;
}): Promise<{ bundle: BackupBundle; body: string; bytes: number; tables: number }> {
  const admin = createAdminSupabase();
  const names = KIND_TABLES[params.kind];

  const results = await Promise.all(
    names.map(async (name) => {
      const spec = TABLES[name];
      const cap = spec.cap ?? ROW_CAP;

      const { data, error } = await admin
        .from(spec.table as never)
        .select(spec.columns)
        .order(spec.orderBy as never, { ascending: false })
        .limit(cap + 1);

      if (error) {
        throw new Error(`Backup of ${name} failed: ${error.message}`);
      }

      const rows = (data ?? []) as unknown as unknown[];
      const capped = rows.length > cap;

      return [
        name,
        { rows: capped ? rows.slice(0, cap) : rows, count: capped ? cap : rows.length, capped },
      ] as const;
    }),
  );

  const tables = Object.fromEntries(results) as BackupBundle["tables"];

  const mediaRefs: string[] = [];
  if (params.kind === "media_refs" || params.kind === "snapshot") {
    const items = tables.menu_items?.rows as { image_url?: string | null }[] | undefined;
    for (const item of items ?? []) {
      if (item.image_url) mediaRefs.push(item.image_url);
    }
  }

  const bundle: BackupBundle = {
    generated_at: new Date().toISOString(),
    kind: params.kind,
    label: params.label,
    row_cap: ROW_CAP,
    tables,
    media_refs: mediaRefs,
  };

  const body = JSON.stringify(bundle, null, 2);
  return {
    bundle,
    body,
    bytes: Buffer.byteLength(body, "utf8"),
    tables: results.length,
  };
}

export function backupObjectPath(backupId: string) {
  return `${backupId}.json`;
}
