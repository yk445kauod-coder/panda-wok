import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo/metadata";
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
    { url: `${siteUrl()}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
  ];

  if (flags.menu !== false) {
    entries.push({
      url: `${siteUrl()}/menu`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    });
  }

  entries.push(
    { url: `${siteUrl()}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl()}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl()}/location`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl()}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl()}/privacy-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  );

  if (flags.loyalty !== false) {
    entries.push({
      url: `${siteUrl()}/loyalty`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  if (flags.feedback !== false) {
    entries.push({
      url: `${siteUrl()}/feedback`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    });
  }

  if (flags.menu !== false) {
    for (const category of slugs.categories) {
      entries.push({
        url: `${siteUrl()}/menu/${category.slug}`,
        lastModified: new Date(category.updated_at),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }

    // Dish pages are the long tail: lower priority than their categories.
    for (const item of slugs.items) {
      entries.push({
        url: `${siteUrl()}/menu/${item.slug}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: "weekly",
        priority: 0.65,
      });
    }
  }

  return entries;
}
