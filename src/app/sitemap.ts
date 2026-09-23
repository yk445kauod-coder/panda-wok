import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/metadata";
import { getMenuSlugs, getFeatureFlagMap } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";


/**
 * Sitemap generated from the live catalogue, so a new dish or category appears
 * without a code change. Private areas are excluded by omission here and
 * blocked in robots.txt as well.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, flags] = await Promise.all([getMenuSlugs(), getFeatureFlagMap()]);
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
  ];

  if (flags.menu !== false) {
    entries.push({
      url: `${SITE_URL}/menu`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    });
  }

  entries.push(
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  );

  if (flags.loyalty !== false) {
    entries.push({
      url: `${SITE_URL}/loyalty`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  if (flags.feedback !== false) {
    entries.push({
      url: `${SITE_URL}/feedback`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    });
  }

  if (flags.menu !== false) {
    for (const category of slugs.categories) {
      entries.push({
        url: `${SITE_URL}/menu/${category.slug}`,
        lastModified: new Date(category.updated_at),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }

    // Dish pages are the long tail: lower priority than their categories.
    for (const item of slugs.items) {
      entries.push({
        url: `${SITE_URL}/menu/${item.slug}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: "weekly",
        priority: 0.65,
      });
    }
  }

  return entries;
}
