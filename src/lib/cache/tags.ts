/**
 * Cache tags for the public, cookie-free data layer.
 *
 * Every read that serves the same bytes to every visitor — the menu, published
 * settings, restaurant row, feature flags — is wrapped in `unstable_cache` with
 * one of these tags. An admin mutation then calls `revalidatePublicData()` with
 * the matching tag, so an edit is visible on the next request instead of waiting
 * out the TTL.
 *
 * Kept free of `server-only` and of any runtime import so both the server
 * services (which tag their reads) and the server actions (which invalidate)
 * can import the same constants.
 */

/**
 * Seconds a public data entry stays fresh. Ten minutes is short enough that a
 * change made directly in the database (outside the admin console, so without a
 * tag revalidation) appears promptly, and long enough that a busy page reuses
 * one Supabase read across many renders instead of one per visitor.
 *
 * This is deliberately the same order of magnitude as the edge cache's
 * `s-maxage` for the same pages: the two layers expire together, so the HTML
 * cache and the data under it cannot drift apart for long.
 */
export const PUBLIC_DATA_REVALIDATE = 600;

/**
 * One tag per independently-editable slice of public data. Grouping them this
 * way keeps an invalidation honest — saving a dish does not evict the settings,
 * so a menu edit cannot cause a stampede of unrelated reads.
 */
export const CACHE_TAGS = {
  /** Categories, dishes, modifier groups/options, slugs, upsell rules, ratings. */
  menu: "public:menu",
  /** Published `settings` rows: brand, contact channels, ordering config. */
  settings: "public:settings",
  /** Admin-editable page copy, FAQs, announcements, delivery zones, page SEO. */
  content: "public:content",
  /** Loyalty reward tiers. */
  rewards: "public:rewards",
  /** Feature flags (loyalty on/off, assistant on/off, ...). */
  flags: "public:flags",
  /** The restaurant singleton row (name, tagline, cuisine tags). */
  restaurant: "public:restaurant",
} as const;

export type PublicCacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/** Every public tag, for a blanket invalidation when the exact slice is unclear. */
export const ALL_PUBLIC_TAGS: PublicCacheTag[] = Object.values(CACHE_TAGS);
