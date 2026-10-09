import type { Locale } from "@/lib/i18n/config";
import type { Restaurant } from "@/lib/services/catalog";

/**
 * The kitchen's own bilingual columns (`name_ar`, `tagline_ar`, `description_ar`)
 * are optional and are currently empty, while `name_en`, `tagline_en` and
 * `description_en` are filled. Reading the English column for an Arabic reader
 * produced a page with Arabic headings wrapped around an English sentence.
 *
 * These resolvers prefer the Arabic column, then the caller's translated
 * fallback, and only reach for English when the caller supplies no fallback at
 * all — so an Arabic page stays Arabic whether or not the kitchen has finished
 * translating its own record.
 */
type BrandSource = Pick<
  Restaurant,
  "name_en" | "name_ar" | "tagline_en" | "tagline_ar" | "description_en" | "description_ar"
>;

function pick(
  arabic: string | null | undefined,
  english: string | null | undefined,
  locale: Locale,
  fallback: string | null,
): string | null {
  if (locale === "ar") return arabic?.trim() || fallback?.trim() || english?.trim() || null;
  return english?.trim() || fallback?.trim() || null;
}

export function brandName(
  restaurant: BrandSource | null,
  locale: Locale,
  fallback: string,
): string {
  return pick(restaurant?.name_ar, restaurant?.name_en, locale, fallback) ?? fallback;
}

export function brandTagline(
  restaurant: BrandSource | null,
  locale: Locale,
  fallback: string,
): string {
  return pick(restaurant?.tagline_ar, restaurant?.tagline_en, locale, fallback) ?? fallback;
}

export function brandDescription(
  restaurant: BrandSource | null,
  locale: Locale,
  fallback: string,
): string {
  return pick(restaurant?.description_ar, restaurant?.description_en, locale, fallback) ?? fallback;
}

/**
 * Place names are proper nouns stored once in English on the restaurant row.
 * These are the Arabic spellings of the places the kitchen actually operates in;
 * an unknown place is passed through unchanged rather than transliterated.
 */
const PLACE_AR: Record<string, string> = {
  Alexandria: "الإسكندرية",
  Cairo: "القاهرة",
  Giza: "الجيزة",
  Egypt: "مصر",
  "Saudi Arabia": "السعودية",
  "United Arab Emirates": "الإمارات العربية المتحدة",
};

export function localisedPlace(place: string | null | undefined, locale: Locale): string {
  if (!place) return "";
  if (locale !== "ar") return place;
  return PLACE_AR[place.trim()] ?? place;
}
