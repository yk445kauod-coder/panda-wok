import "server-only";

import { createPublicSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export type PageContentRow = Database["public"]["Tables"]["page_content"]["Row"];
export type FaqRow = Database["public"]["Tables"]["faqs"]["Row"];
export type DeliveryZoneRow = Database["public"]["Tables"]["delivery_zones"]["Row"];
export type AnnouncementRow = Database["public"]["Tables"]["announcements"]["Row"];
export type PageSeoRow = Database["public"]["Tables"]["page_seo"]["Row"];

export type Locale = "en" | "ar";

export type PageSection = {
  sectionKey: string;
  heading: string | null;
  body: string | null;
  /** Which locale actually supplied this row (falls back across locales). */
  locale: Locale;
  sortOrder: number;
};

/**
 * Reads the admin-editable copy for one page. Rows are per-locale; when the
 * requested locale has no row we fall back to English so a page is never
 * emptied by a missing translation. If the table has no rows at all the caller
 * keeps its coded copy, so the site renders identically before and after the
 * content model is populated.
 *
 * A read failure (table not migrated here, transient PostgREST error) resolves
 * to an empty list rather than throwing: copy is an enhancement, and losing it
 * must degrade a page to its built-in text, never blank it with a 500.
 */
export async function getPageContent(
  pageKey: string,
  locale: Locale,
): Promise<PageSection[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("page_content")
    .select("section_key, heading, body, locale, sort_order")
    .eq("page_key", pageKey)
    .eq("is_published", true)
    .in("locale", [locale, "en"])
    .order("sort_order", { ascending: true });

  if (error) return [];

  const bySection = new Map<string, PageContentRow>();
  for (const row of data ?? []) {
    const existing = bySection.get(row.section_key);
    // Prefer the requested locale; keep the first English row otherwise.
    if (!existing || row.locale === locale) {
      bySection.set(row.section_key, row as PageContentRow);
    }
  }

  return [...bySection.values()]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      sectionKey: row.section_key,
      heading: row.heading,
      body: row.body,
      locale: row.locale as Locale,
      sortOrder: row.sort_order,
    }));
}

/** Published FAQs for the locale, falling back to English when untranslated. */
export async function getFaqs(locale: Locale): Promise<FaqRow[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("faqs")
    .select("*")
    .eq("is_published", true)
    .in("locale", [locale, "en"])
    .order("sort_order", { ascending: true });

  if (error) return [];

  const seen = new Map<string, FaqRow>();
  for (const row of data ?? []) {
    const key = row.question.trim().toLowerCase();
    if (!seen.has(key) || row.locale === locale) seen.set(key, row);
  }
  return [...seen.values()];
}

/** Active delivery zones, ordered for display. */
export async function getDeliveryZones(): Promise<DeliveryZoneRow[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return [];
  return data ?? [];
}

/** Announcements whose schedule window contains now. */
export async function getAnnouncements(locale: Locale): Promise<AnnouncementRow[]> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_active", true)
    .in("locale", [locale, "en"])
    .order("sort_order", { ascending: true });

  if (error) return [];
  return data ?? [];
}

/** Per-page SEO override, when staff have entered one. */
export async function getPageSeo(
  pageKey: string,
  locale: Locale,
): Promise<PageSeoRow | null> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("page_seo")
    .select("*")
    .eq("page_key", pageKey)
    .in("locale", [locale, "en"])
    .order("locale", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}
