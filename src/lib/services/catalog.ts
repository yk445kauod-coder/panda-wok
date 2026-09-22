import "server-only";

import { createPublicSupabase } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/types/database";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type MenuItemRow = Database["public"]["Tables"]["menu_items"]["Row"];
export type MenuImage = Database["public"]["Tables"]["menu_images"]["Row"];
export type UpsellRule = Database["public"]["Tables"]["upsell_rules"]["Row"];
export type FeatureFlag = Database["public"]["Tables"]["feature_flags"]["Row"];
export type Setting = Database["public"]["Tables"]["settings"]["Row"];
export type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
export type LoyaltyReward = Database["public"]["Tables"]["loyalty_rewards"]["Row"];

export type ModifierOption = Database["public"]["Tables"]["modifier_options"]["Row"];
export type ModifierGroup = Database["public"]["Tables"]["modifier_groups"]["Row"];
export type ModifierGroupWithOptions = ModifierGroup & {
  modifier_options: ModifierOption[];
};

/**
 * Public reads select an explicit column list, so these types are the subset
 * that is safe to expose rather than the full table row.
 */
export type Category = Pick<
  CategoryRow,
  | "id"
  | "name_en"
  | "name_ar"
  | "name_ja"
  | "slug"
  | "description_en"
  | "description_ar"
  | "image_url"
  | "seo_title"
  | "seo_description"
  | "sort_order"
  | "is_enabled"
>;

export type MenuItem = Pick<
  MenuItemRow,
  | "id"
  | "category_id"
  | "name_en"
  | "name_ar"
  | "name_ja"
  | "slug"
  | "description_en"
  | "description_ar"
  | "price"
  | "compare_at_price"
  | "is_available"
  | "is_featured"
  | "is_spicy"
  | "is_vegetarian"
  | "is_vegan"
  | "contains_nuts"
  | "prep_minutes"
  | "calories"
  | "allergens"
  | "ingredients"
  | "image_url"
  | "image_alt"
  | "has_transparent_png"
  | "sort_order"
  | "seo_title"
  | "seo_description"
  | "seo_keywords"
>;

export type MenuItemWithCategory = MenuItem & {
  categories: Pick<CategoryRow, "id" | "name_en" | "name_ar" | "slug" | "sort_order"> | null;
};

export type MenuItemDetail = MenuItemWithCategory & {
  modifier_groups: ModifierGroupWithOptions[];
  menu_images: MenuImage[];
};

const PUBLIC_CATEGORY_COLUMNS =
  "id, name_en, name_ar, name_ja, slug, description_en, description_ar, image_url, seo_title, seo_description, sort_order, is_enabled";

const PUBLIC_ITEM_COLUMNS =
  "id, category_id, name_en, name_ar, name_ja, slug, description_en, description_ar, price, compare_at_price, is_available, is_featured, is_spicy, is_vegetarian, is_vegan, contains_nuts, prep_minutes, calories, allergens, ingredients, image_url, image_alt, has_transparent_png, sort_order, seo_title, seo_description, seo_keywords";

/**
 * Public catalogue reads go through the anon/authenticated client so RLS is
 * the boundary. Only enabled categories and their items are returned.
 */
export async function getPublicCategories(): Promise<Category[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("categories")
    .select(PUBLIC_CATEGORY_COLUMNS)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load menu categories: ${error.message}`);
  return data ?? [];
}

export async function getPublicMenu(): Promise<{
  categories: Category[];
  items: MenuItem[];
}> {
  const supabase = createPublicSupabase();
  const [categories, items] = await Promise.all([
    getPublicCategories(),
    supabase
      .from("menu_items")
      .select(PUBLIC_ITEM_COLUMNS)
      .eq("is_archived", false)
      .order("sort_order", { ascending: true }),
  ]);

  if (items.error) throw new Error(`Failed to load menu: ${items.error.message}`);

  const enabledIds = new Set(categories.map((c) => c.id));
  return {
    categories,
    items: (items.data ?? []).filter((item) => enabledIds.has(item.category_id)),
  };
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("categories")
    .select(PUBLIC_CATEGORY_COLUMNS)
    .eq("slug", slug)
    .eq("is_enabled", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to load category: ${error.message}`);
  return data ?? null;
}

export async function getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("menu_items")
    .select(PUBLIC_ITEM_COLUMNS)
    .eq("category_id", categoryId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load category items: ${error.message}`);
  return data ?? [];
}

export async function getMenuItemBySlug(slug: string): Promise<MenuItemDetail | null> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      `${PUBLIC_ITEM_COLUMNS}, categories (id, name_en, name_ar, slug, sort_order), modifier_groups (id, menu_item_id, name_en, name_ar, min_select, max_select, is_required, sort_order, modifier_options (id, group_id, name_en, name_ar, price_delta, is_available, sort_order)), menu_images (id, menu_item_id, storage_path, external_url, alt_en, alt_ar, role, width, height, format, bytes, sort_order, created_at)`,
    )
    .eq("slug", slug)
    .eq("is_archived", false)
    .maybeSingle();

  if (error) throw new Error(`Failed to load dish: ${error.message}`);
  if (!data) return null;

  const detail = data as unknown as MenuItemDetail;
  return {
    ...detail,
    modifier_groups: (detail.modifier_groups ?? [])
      .map((group) => ({
        ...group,
        modifier_options: (group.modifier_options ?? [])
          .filter((option) => option.is_available)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
    menu_images: (detail.menu_images ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  };
}

/** Slugs for the sitemap. Disabled categories are excluded. */
export async function getMenuSlugs(): Promise<{
  categories: { id: string; slug: string; name_en: string; updated_at: string }[];
  items: { slug: string; name_en: string; category_id: string; updated_at: string }[];
}> {
  const supabase = createPublicSupabase();
  const [categories, items] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, name_en, updated_at")
      .eq("is_enabled", true),
    supabase
      .from("menu_items")
      .select("slug, name_en, category_id, updated_at")
      .eq("is_archived", false),
  ]);

  if (categories.error) throw new Error(categories.error.message);
  if (items.error) throw new Error(items.error.message);

  return {
    categories: categories.data ?? [],
    items: items.data ?? [],
  };
}

export async function getUpsellRules(): Promise<UpsellRule[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("upsell_rules")
    .select("*")
    .eq("is_enabled", true)
    .order("priority", { ascending: true });

  if (error) throw new Error(`Failed to load upsell rules: ${error.message}`);
  return data ?? [];
}

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, label, description, module, is_enabled, sort_order, updated_at")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load feature flags: ${error.message}`);
  return data ?? [];
}

/** Flag lookup as a plain map; defaults to enabled when a flag is absent. */
export async function getFeatureFlagMap(): Promise<Record<string, boolean>> {
  const flags = await getFeatureFlags();
  return Object.fromEntries(flags.map((f) => [f.key, f.is_enabled]));
}

export type PublicSettings = {
  brand: {
    name: string;
    city: string;
    country: string;
    cuisine: string;
    tagline: string;
  };
  support: {
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    social: Record<string, string>;
    openingHours: Json;
  };
  ordering: {
    minOrderTotal: number;
    freeDeliveryOver: number;
    deliveryFee: number;
    etaMinutes: number;
    acceptingOrders: boolean;
  };
  loyalty: {
    pointsPerCurrency: number;
    pointValue: number;
  };
  ai: {
    assistantEnabled: boolean;
    disclosure: string;
  };
};

function toNumber(value: Json | undefined, fallback: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function toText(value: Json | undefined, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toNullableText(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Public settings come from RLS-filtered rows marked is_public, so internal
 * values (VAT rate, point economics) never reach the browser.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .eq("is_public", true);

  if (error) throw new Error(`Failed to load settings: ${error.message}`);

  const map = new Map<string, Json>(
    (data ?? []).map((row) => [row.key, row.value]),
  );

  const social: Record<string, string> = {};
  const socialRaw = map.get("support.social");
  if (socialRaw && typeof socialRaw === "object" && !Array.isArray(socialRaw)) {
    for (const [key, value] of Object.entries(socialRaw)) {
      if (typeof value === "string" && value.trim()) social[key] = value;
    }
  }

  return {
    brand: {
      name: toText(map.get("brand.name"), "Panda Wok"),
      city: toText(map.get("brand.city"), "Alexandria"),
      country: toText(map.get("brand.country"), "Egypt"),
      cuisine: toText(map.get("brand.cuisine"), "Asian cuisine"),
      tagline: toText(map.get("brand.tagline"), "Asian kitchen, crafted to order"),
    },
    support: {
      phone: toNullableText(map.get("support.phone")),
      whatsapp: toNullableText(map.get("support.whatsapp")),
      email: toNullableText(map.get("support.email")),
      social,
      openingHours: map.get("support.opening_hours") ?? {},
    },
    ordering: {
      minOrderTotal: toNumber(map.get("ordering.min_order_total"), 80),
      freeDeliveryOver: toNumber(map.get("delivery.free_over"), 250),
      deliveryFee: toNumber(map.get("delivery.fee"), 30),
      etaMinutes: toNumber(map.get("delivery.eta_minutes"), 35),
      acceptingOrders: map.get("ordering.accepting_orders") !== false,
    },
    loyalty: {
      pointsPerCurrency: toNumber(map.get("loyalty.points_per_currency"), 1),
      pointValue: toNumber(map.get("loyalty.point_value"), 1),
    },
    ai: {
      assistantEnabled: map.get("ai.assistant.enabled") !== false,
      disclosure: toText(
        map.get("ai.assistant.disclosure"),
        "Answers are generated by an AI assistant from live Panda Wok data.",
      ),
    },
  };
}

export async function getRestaurant(): Promise<Restaurant | null> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load restaurant: ${error.message}`);
  return data ?? null;
}

export async function getEnabledRewards(): Promise<LoyaltyReward[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("is_enabled", true)
    .order("points_cost", { ascending: true });

  if (error) throw new Error(`Failed to load rewards: ${error.message}`);
  return data ?? [];
}

/** Featured and cheap-to-prepare picks for the home page. */
export async function getFeaturedItems(limit = 6): Promise<MenuItem[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("menu_items")
    .select(PUBLIC_ITEM_COLUMNS)
    .eq("is_featured", true)
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load featured items: ${error.message}`);
  return data ?? [];
}
