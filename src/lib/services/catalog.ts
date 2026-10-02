import "server-only";

import { cache } from "react";
import { createPublicSupabase } from "@/lib/supabase/server";
import { cachedPublic } from "@/lib/cache/public-cache";
import { STORE_TIME_ZONE, type StoreHours } from "@/lib/services/store-hours";
import { CACHE_TAGS, PUBLIC_DATA_REVALIDATE } from "@/lib/cache/tags";
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
> & {
  modifier_groups?: ModifierGroupWithOptions[];
};

export type MenuItemWithCategory = MenuItem & {
  categories: Pick<CategoryRow, "id" | "name_en" | "name_ar" | "slug" | "sort_order"> | null;
};

export type MenuItemDetail = MenuItemWithCategory & {
  modifier_groups: ModifierGroupWithOptions[];
  menu_images: MenuImage[];
};

/**
 * A dish's public star average, aggregated in the database from
 * customer-consented feedback (`public.menu_item_ratings`).
 *
 * It is deliberately a separate read rather than a column on `menu_items`: the
 * average is derived from orders and feedback, and denormalising it onto the
 * item would let the two drift.
 */
export type MenuRating = {
  average: number;
  count: number;
};

const PUBLIC_CATEGORY_COLUMNS =
  "id, name_en, name_ar, slug, description_en, description_ar, image_url, seo_title, seo_description, sort_order, is_enabled";

const PUBLIC_ITEM_COLUMNS =
  "id, category_id, name_en, name_ar, slug, description_en, description_ar, price, compare_at_price, is_available, is_featured, is_spicy, is_vegetarian, is_vegan, contains_nuts, prep_minutes, calories, allergens, ingredients, image_url, image_alt, has_transparent_png, sort_order, seo_title, seo_description, seo_keywords";
const PUBLIC_ITEM_WITH_MODIFIERS_COLUMNS = `${PUBLIC_ITEM_COLUMNS}, modifier_groups (id, menu_item_id, name_en, name_ar, min_select, max_select, is_required, sort_order, modifier_options (id, group_id, name_en, name_ar, price_delta, is_available, sort_order))`;

/**
 * Public catalogue reads go through the anon/authenticated client so RLS is
 * the boundary. Only enabled categories and their items are returned.
 *
 * The read is cached: every visitor sees the same categories, so one Supabase
 * query is reused across renders until the entry expires or an admin edit
 * invalidates `CACHE_TAGS.menu`. The `raw` variant is the uncached query, kept
 * separate so a cached function never calls another cached function — Next
 * bypasses the cache for a nested `unstable_cache` call, which would silently
 * make the outer entry depend on uncached reads.
 */
async function getPublicCategoriesRaw(): Promise<Category[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("categories")
    .select(PUBLIC_CATEGORY_COLUMNS)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load menu categories: ${error.message}`);
  return data ?? [];
}

export const getPublicCategories = cachedPublic(
  getPublicCategoriesRaw,
  ["public-categories"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.menu] },
);

async function getPublicMenuRaw(): Promise<{
  categories: Category[];
  items: MenuItem[];
}> {
  const supabase = createPublicSupabase();
  const [categories, items] = await Promise.all([
    getPublicCategoriesRaw(),
    supabase
      .from("menu_items")
      .select(PUBLIC_ITEM_WITH_MODIFIERS_COLUMNS)
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

export const getPublicMenu = cachedPublic(
  getPublicMenuRaw,
  ["public-menu"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.menu] },
);

async function getCategoryBySlugRaw(slug: string): Promise<Category | null> {
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

export const getCategoryBySlug = cachedPublic(
  getCategoryBySlugRaw,
  ["public-category-by-slug"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.menu] },
);

async function getMenuItemsByCategoryRaw(categoryId: string): Promise<MenuItem[]> {
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

export const getMenuItemsByCategory = cachedPublic(
  getMenuItemsByCategoryRaw,
  ["public-category-items"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.menu] },
);

async function getMenuItemBySlugRaw(slug: string): Promise<MenuItemDetail | null> {
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
    // Unavailable options are kept rather than filtered out: the dish page
    // shows them greyed with an "out of stock" note, so a customer who came for the
    // shrimp can see why it is not selectable instead of wondering where it
    // went. `place_order` rejects them either way.
    modifier_groups: (detail.modifier_groups ?? [])
      .map((group) => ({
        ...group,
        modifier_options: (group.modifier_options ?? []).sort(
          (a, b) => a.sort_order - b.sort_order,
        ),
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
    menu_images: (detail.menu_images ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  };
}

export const getMenuItemBySlug = cachedPublic(
  getMenuItemBySlugRaw,
  ["public-menu-item-by-slug"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.menu] },
);

/** Slugs for the sitemap. Disabled categories are excluded. */
async function getMenuSlugsRaw(): Promise<{
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

export const getMenuSlugs = cachedPublic(
  getMenuSlugsRaw,
  ["public-menu-slugs"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.menu] },
);

async function getUpsellRulesRaw(): Promise<UpsellRule[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("upsell_rules")
    .select("*")
    .eq("is_enabled", true)
    .order("priority", { ascending: true });

  if (error) throw new Error(`Failed to load upsell rules: ${error.message}`);
  return data ?? [];
}

export const getUpsellRules = cachedPublic(
  getUpsellRulesRaw,
  ["public-upsell-rules"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.menu] },
);

async function getFeatureFlagsRaw(): Promise<FeatureFlag[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, label, description, module, is_enabled, sort_order, updated_at")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load feature flags: ${error.message}`);
  return data ?? [];
}

const getFeatureFlagsCached = cachedPublic(
  getFeatureFlagsRaw,
  ["public-feature-flags"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.flags] },
);

export function getFeatureFlags(): Promise<FeatureFlag[]> {
  return getFeatureFlagsCached();
}

/** Flag lookup as a plain map; defaults to enabled when a flag is absent. */
const getFeatureFlagMapCached = cachedPublic(
  async () => {
    const flags = await getFeatureFlagsRaw();
    return Object.fromEntries(flags.map((f) => [f.key, f.is_enabled]));
  },
  ["public-feature-flag-map"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.flags] },
);

export function getFeatureFlagMap(): Promise<Record<string, boolean>> {
  return getFeatureFlagMapCached();
}

export type PublicSettings = {
  brand: {
    name: string;
    city: string;
    country: string;
    cuisine: string;
    tagline: string;
    logo_url: string | null;
    favicon_url: string | null;
    banner_url: string | null;
    hero_url: string | null;
  };
  support: {
    phone: string | null;
    phoneSecondary: string | null;
    email: string | null;
    instapayUrl: string | null;
    social: Record<string, string>;
    openingHours: Json;
  };
  ordering: {
    minOrderTotal: number;
    freeDeliveryOver: number;
    deliveryFee: number;
    etaMinutes: number;
    acceptingOrders: boolean;
    hours: StoreHours;
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

/**
 * A stored clock value, accepted only when it is a real "HH:MM". A malformed
 * value falls back rather than propagating, because an unparseable window must
 * not be able to close the storefront.
 */
function toClock(value: Json | undefined, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(text) ? text : fallback;
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
 *
 * Cached twice on purpose: `unstable_cache` stores the parsed result across
 * requests, and the React `cache()` wrapper dedupes concurrent calls within one
 * render. The two are distinct — React's `cache` does not persist, so without
 * the `unstable_cache` layer every request would re-read the settings table.
 */
async function loadPublicSettings(): Promise<PublicSettings> {
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
      logo_url: toNullableText(map.get("brand.logo_url")),
      favicon_url: toNullableText(map.get("brand.favicon_url")),
      banner_url: toNullableText(map.get("brand.banner_url")),
      hero_url: toNullableText(map.get("brand.hero_url")),
    },
    support: {
      phone: toNullableText(map.get("support.phone")),
      phoneSecondary: toNullableText(map.get("support.phone_secondary")),
      email: toNullableText(map.get("support.email")),
      instapayUrl: toNullableText(map.get("support.instapay_url")),
      social,
      openingHours: map.get("support.opening_hours") ?? {},
    },
    ordering: {
      minOrderTotal: toNumber(map.get("ordering.min_order_total"), 80),
      freeDeliveryOver: toNumber(map.get("delivery.free_over"), 250),
      deliveryFee: toNumber(map.get("delivery.fee"), 30),
      etaMinutes: toNumber(map.get("delivery.eta_minutes"), 35),
      acceptingOrders: map.get("ordering.accepting_orders") !== false,
      hours: {
        enabled: map.get("ordering.hours_enabled") === true,
        openTime: toClock(map.get("ordering.open_time"), "14:00"),
        closeTime: toClock(map.get("ordering.close_time"), "01:00"),
        timeZone: STORE_TIME_ZONE,
      },
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

const getPublicSettingsCached = cachedPublic(
  loadPublicSettings,
  ["public-settings"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.settings] },
);

export const getPublicSettings = cache(getPublicSettingsCached);

async function getRestaurantRaw(): Promise<Restaurant | null> {
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

export const getRestaurant = cachedPublic(
  getRestaurantRaw,
  ["public-restaurant"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.restaurant] },
);

async function getEnabledRewardsRaw(): Promise<LoyaltyReward[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("is_enabled", true)
    .order("points_cost", { ascending: true });

  if (error) throw new Error(`Failed to load rewards: ${error.message}`);
  return data ?? [];
}

export const getEnabledRewards = cachedPublic(
  getEnabledRewardsRaw,
  ["public-enabled-rewards"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.rewards] },
);

/** Featured and cheap-to-prepare picks for the home page. */
async function getFeaturedItemsRaw(limit: number): Promise<MenuItem[]> {
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

// The `limit` argument is part of the cache key, so each distinct limit is
// cached separately rather than the first caller's result being reused.
const getFeaturedItemsCached = cachedPublic(
  getFeaturedItemsRaw,
  ["public-featured-items"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.menu] },
);

export function getFeaturedItems(limit = 6): Promise<MenuItem[]> {
  return getFeaturedItemsCached(limit);
}

/**
 * Star averages for every dish that has consented feedback, keyed by item id.
 *
 * Returns an empty map when nothing has been rated, which is the honest state
 * for a new kitchen: the cards then render no stars at all rather than a
 * fabricated score. A failure here is swallowed to an empty map on purpose —
 * a rating is decoration on top of the menu, and losing it must never take the
 * menu down with it.
 *
 * The cached value is a plain record, not a `Map`: `unstable_cache` persists its
 * result as JSON, and a `Map` would round-trip to `{}` and silently drop every
 * rating. The `Map` is rebuilt for callers after the cache read.
 */
async function getMenuRatingsRaw(): Promise<Record<string, MenuRating>> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("menu_item_ratings")
    .select("menu_item_id, average_rating, rating_count");

  if (error) {
    console.warn(`[catalog] ratings unavailable: ${error.message}`);
    return {};
  }

  const ratings: Record<string, MenuRating> = {};
  for (const row of data ?? []) {
    // The view's columns are nullable in the generated types because SQL cannot
    // prove the group key is present. A row without an item id is not usable,
    // so it is skipped rather than coerced into an empty-string key.
    if (!row.menu_item_id) continue;
    const count = Number(row.rating_count ?? 0);
    if (count < 1) continue;
    ratings[row.menu_item_id] = {
      average: Number(row.average_rating ?? 0),
      count,
    };
  }
  return ratings;
}

const getMenuRatingsCached = cachedPublic(
  getMenuRatingsRaw,
  ["public-menu-ratings"],
  { revalidate: PUBLIC_DATA_REVALIDATE, tags: [CACHE_TAGS.menu] },
);

export async function getMenuRatings(): Promise<Map<string, MenuRating>> {
  return new Map(Object.entries(await getMenuRatingsCached()));
}
