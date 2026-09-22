import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

/**
 * Admin-side catalogue reads. These run with a user-bound client, so staff RLS
 * policies are the boundary; every page has already asserted a capability.
 */

export type AdminMenuItem = Database["public"]["Tables"]["menu_items"]["Row"] & {
  categories: { id: string; name_en: string; slug: string } | null;
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

export type AdminStockItem = Database["public"]["Tables"]["stock_items"]["Row"] & {
  linked_items: number;
};

export async function listStockItems(): Promise<AdminStockItem[]> {
  const supabase = await createServerSupabase();

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

/** Menu items that a stock movement could affect, for the linkage editor. */
export async function listStockLinkOptions(): Promise<
  { id: string; name_en: string; stock_item_id: string | null }[]
> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("menu_item_stock")
    .select("menu_item_id, stock_item_id, menu_items (id, name_en)")
    .limit(500);

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.menu_item_id,
    name_en:
      (row as unknown as { menu_items?: { name_en: string } | null }).menu_items?.name_en ??
      "Unnamed dish",
    stock_item_id: row.stock_item_id,
  }));
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
  const { data, error } = await supabase
    .from("exports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load exports: ${error.message}`);
  return data ?? [];
}

export async function listBackups(limit = 50) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("backup_records")
    .select("*")
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

export async function listUpsellRules() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("upsell_rules")
    .select("*")
    .order("priority", { ascending: true });

  if (error) throw new Error(`Failed to load upsell rules: ${error.message}`);
  return data ?? [];
}
