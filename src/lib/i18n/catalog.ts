import type { Locale } from "@/lib/i18n/config";
import type { Category } from "@/lib/services/catalog";

/**
 * Picks the right language out of the bilingual columns the catalogue already
 * stores (`name_en` / `name_ar`, and the same for descriptions and SEO text).
 * Falls back to English whenever the Arabic column is empty, so a dish that
 * has not been translated yet still renders instead of showing a blank.
 */

type Bilingual = {
  name_en: string;
  name_ar?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
};

export function localiseCategory<T extends Category>(category: T, locale: Locale): T & { name: string; description: string | null } {
  const name = locale === "ar" && category.name_ar?.trim() ? category.name_ar : category.name_en;
  const description =
    locale === "ar" && category.description_ar?.trim()
      ? category.description_ar
      : category.description_en ?? null;
  return { ...category, name, description };
}

/** Localised name for a bilingual record without spreading it. */
export function localisedName(record: Bilingual, locale: Locale): string {
  return locale === "ar" && record.name_ar?.trim() ? record.name_ar : record.name_en;
}

export function localisedDescription(
  record: Bilingual,
  locale: Locale,
): string | null {
  return locale === "ar" && record.description_ar?.trim()
    ? record.description_ar
    : record.description_en ?? null;
}
