import "server-only";

import { createServerSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

/**
 * Admin-side catalogue reads. These run with a user-bound client, so staff RLS
 * policies are the boundary; every page has already asserted a capability.
 */

export type AdminMenuItem = Database["public"]["Tables"]["menu_items"]["Row"] & {
  categories: { id: string; name_en: string; slug: string } | null;
};

export type AdminModifierOption = Database["public"]["Tables"]["modifier_options"]["Row"];
export type AdminModifierGroup = Database["public"]["Tables"]["modifier_groups"]["Row"] & {
  modifier_options: AdminModifierOption[];
};

export async function listAdminMenuItems(params?: {
  categoryId?: string;
  includeArchived?: boolean;
  search?: string;
  limit?: number;
}): Promise<AdminMenuItem[]> {
  const supabase = await createServerSupabase();

  let query = supabase
    .from("menu_items")
    .select("*, categories (id, name_en, slug)")
    .order("category_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(params?.limit ?? 300);

  if (!params?.includeArchived) query = query.eq("is_archived", false);
  if (params?.categoryId) query = query.eq("category_id", params.categoryId);
  if (params?.search) query = query.ilike("name_en", `%${params.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load dishes: ${error.message}`);
  return (data ?? []) as unknown as AdminMenuItem[];
}

export async function getAdminMenuItem(id: string): Promise<AdminMenuItem | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("menu_items")
    .select("*, categories (id, name_en, slug)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the dish: ${error.message}`);
  return (data as unknown as AdminMenuItem) ?? null;
}

/** Option groups for a dish, with their options, in display order. */
export async function getAdminModifierGroups(
  menuItemId: string,
): Promise<AdminModifierGroup[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("modifier_groups")
    .select("*, modifier_options (*)")
    .eq("menu_item_id", menuItemId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load option groups: ${error.message}`);

  return (data ?? []).map((row) => {
    const group = row as unknown as AdminModifierGroup;
    return {
      ...group,
      modifier_options: (group.modifier_options ?? []).sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    };
  });
}

export type AdminCategory = Database["public"]["Tables"]["categories"]["Row"] & {
  item_count: number;
};

export async function listAdminCategories(): Promise<AdminCategory[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("categories")
    .select("*, menu_items (id)")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load categories: ${error.message}`);

  return (data ?? []).map((row) => {
    const items = (row as unknown as { menu_items?: { id: string }[] }).menu_items ?? [];
    const { menu_items: _items, ...category } = row as unknown as Record<string, unknown> & {
      menu_items?: unknown;
    };
    return { ...(category as unknown as AdminCategory), item_count: items.length };
  });
}

/**
 * Client for reads that only ever run for staff: the admin console, and the ops
 * agent both in its chat screen and in background runs (the scheduled report,
 * which has no HTTP request at all).
 *
 * The admin console is opened with the passcode gate rather than a Supabase
 * session, so these tables' staff-RLS policies authorise nothing there. The
 * request-scoped client works only because the middleware flags `/admin` with
 * `x-pw-path` and `createServerSupabase()` elevates on it — which means a
 * background run throws "`headers` was called outside a request scope", and the
 * cron route (no `x-pw-path`) silently reads zero rows. Both look like "there is
 * no data". Authorisation for these reads is the gate, so the service role is
 * the honest client; `createServerSupabase()` remains the fallback for a
 * deployment without a service key.
 */
async function staffTableClient() {
  return tryCreateAdminSupabase() ?? (await createServerSupabase());
}

export type AdminStockItem = Database["public"]["Tables"]["stock_items"]["Row"] & {
  linked_items: number;
};

export async function listStockItems(): Promise<AdminStockItem[]> {
  const supabase = await staffTableClient();

  const { data, error } = await supabase
    .from("stock_items")
    .select("*, menu_item_stock (menu_item_id)")
    .order("status", { ascending: true })
    .order("name_en", { ascending: true });

  if (error) throw new Error(`Failed to load stock: ${error.message}`);

  return (data ?? []).map((row) => {
    const links =
      (row as unknown as { menu_item_stock?: { menu_item_id: string }[] })
        .menu_item_stock ?? [];
    const { menu_item_stock: _links, ...item } = row as unknown as Record<string, unknown> & {
      menu_item_stock?: unknown;
    };
    return { ...(item as unknown as AdminStockItem), linked_items: links.length };
  });
}

export async function listStockMovements(stockItemId?: string, limit = 50) {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("stock_movements")
    .select("*, stock_items (name_en, unit)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (stockItemId) query = query.eq("stock_item_id", stockItemId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load stock movements: ${error.message}`);
  return data ?? [];
}

export async function listRewards(): Promise<
  Database["public"]["Tables"]["loyalty_rewards"]["Row"][]
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .order("points_cost", { ascending: true });

  if (error) throw new Error(`Failed to load rewards: ${error.message}`);
  return data ?? [];
}

export async function listFeedbackAdmin(params: {
  status?: Database["public"]["Enums"]["feedback_status"];
  category?: Database["public"]["Enums"]["feedback_category"];
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const supabase = await createServerSupabase();

  let query = supabase
    .from("feedback")
    .select("*, profiles (id, full_name, phone, email)")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 100);

  if (params.status) query = query.eq("status", params.status);
  if (params.category) query = query.eq("category", params.category);
  if (params.search) query = query.ilike("message", `%${params.search}%`);
  if (params.offset) {
    const limit = params.limit ?? 100;
    query = query.range(params.offset, params.offset + limit - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load feedback: ${error.message}`);

  return (data ?? []).map((row) => ({
    ...(row as unknown as Database["public"]["Tables"]["feedback"]["Row"]),
    customer:
      (row as unknown as {
        profiles?: { id: string; full_name: string | null; phone: string | null; email: string | null } | null;
      }).profiles ?? null,
  }));
}

export async function listSettings(): Promise<
  Database["public"]["Tables"]["settings"]["Row"][]
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .order("key", { ascending: true });

  if (error) throw new Error(`Failed to load settings: ${error.message}`);
  return data ?? [];
}

export async function listFeatureFlags(): Promise<
  Database["public"]["Tables"]["feature_flags"]["Row"][]
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("*")
    .order("module", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load feature flags: ${error.message}`);
  return data ?? [];
}

export async function listBroadcasts(limit = 50) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("broadcasts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load broadcasts: ${error.message}`);
  return data ?? [];
}

export async function listExports(limit = 50) {
  const supabase = await createServerSupabase();
  // `content` holds the file bytes and is deliberately excluded: the list page
  // must not pull every export body into memory. `content_encoding` is the
  // lightweight indicator that a row stores its file locally.
  const { data, error } = await supabase
    .from("exports")
    .select(
      "id, dataset, format, filters, status, row_count, storage_path, bytes, error, requested_by, created_at, completed_at, expires_at, content_encoding",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load exports: ${error.message}`);
  return data ?? [];
}

export async function listBackups(limit = 50) {
  const supabase = await createServerSupabase();
  // `content` excluded for the same reason as exports.
  const { data, error } = await supabase
    .from("backup_records")
    .select(
      "id, kind, status, label, format, storage_path, bytes, manifest, error, created_by, created_at, completed_at, content_encoding",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load backups: ${error.message}`);
  return data ?? [];
}

export async function listAiProviders() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ai_providers")
    .select("*")
    .order("priority", { ascending: true });

  if (error) throw new Error(`Failed to load AI providers: ${error.message}`);
  return data ?? [];
}

/**
 * Stored credential names and a masked hint for each. Values are never read
 * here — the RPC returns only a four-character tail so an operator can tell
 * which key is installed without it leaving Vault.
 */
export async function listAiSecretHints(): Promise<
  { name: string; hint: string; updated_at: string }[]
> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  const { data, error } = await admin.rpc("list_ai_secret_hints");
  if (error) return [];
  return data ?? [];
}

export async function listAiPrompts() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ai_prompts")
    .select("*")
    .order("key", { ascending: true });

  if (error) throw new Error(`Failed to load AI prompts: ${error.message}`);
  return data ?? [];
}

export async function listAiRequests(limit = 100) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ai_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load AI requests: ${error.message}`);
  return data ?? [];
}

export async function listStaff(): Promise<
  (Database["public"]["Tables"]["staff"]["Row"] & {
    profiles: { full_name: string | null; email: string | null } | null;
  })[]
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("staff")
    .select("*, profiles (full_name, email)")
    .order("role", { ascending: true });

  if (error) throw new Error(`Failed to load the team: ${error.message}`);

  return (data ?? []) as unknown as (Database["public"]["Tables"]["staff"]["Row"] & {
    profiles: { full_name: string | null; email: string | null } | null;
  })[];
}

/** Head-count for a filtered list, so pages can paginate. */
export async function countFeedbackAdmin(params: {
  status?: Database["public"]["Enums"]["feedback_status"];
  category?: Database["public"]["Enums"]["feedback_category"];
  search?: string;
}): Promise<number> {
  const supabase = await createServerSupabase();

  let query = supabase.from("feedback").select("id", { count: "exact", head: true });

  if (params.status) query = query.eq("status", params.status);
  if (params.category) query = query.eq("category", params.category);
  if (params.search) query = query.ilike("message", `%${params.search}%`);

  const { count, error } = await query;
  if (error) throw new Error(`Failed to count feedback: ${error.message}`);
  return count ?? 0;
}

export async function listUpsellRules() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("upsell_rules")
    .select("*")
    .order("priority", { ascending: true });

  if (error) throw new Error(`Failed to load upsell rules: ${error.message}`);
  return data ?? [];
}

/* ----------------------------------------------------------------- content */

export async function listPageContent() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("page_content")
    .select("*")
    .order("page_key", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load page content: ${error.message}`);
  return data ?? [];
}

export async function listFaqs() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("faqs")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load FAQs: ${error.message}`);
  return data ?? [];
}

export async function listDeliveryZones() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load delivery zones: ${error.message}`);
  return data ?? [];
}

export async function listAnnouncements() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load announcements: ${error.message}`);
  return data ?? [];
}

/* ------------------------------------------------------------------ offers */

export type AdminOffer = Database["public"]["Tables"]["offers"]["Row"];

/**
 * Every offer, enabled or not, so the console can show the full picture and a
 * disabled promotion is still editable. Ordered the way checkout ranks them.
 */
export async function listOffers() {
  const supabase = await staffTableClient();
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("threshold", { ascending: true });

  if (error) throw new Error(`Failed to load offers: ${error.message}`);
  return data ?? [];
}
