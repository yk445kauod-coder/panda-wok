import { DEFAULT_LOCALE, toLocale, type Locale } from "@/lib/i18n/config";
import { en, type Dictionary } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { makeTranslator, type Translator } from "@/lib/i18n/translate";

/**
 * Request-free translation, for components that must stay prerenderable.
 *
 * The server helpers in `server.ts` resolve the locale from cookies and
 * headers, which forces every route that calls them into the dynamic path.
 * The public pages are localized per URL instead (`/[lang]/…`), so they know
 * their locale from the route segment and never need a request. Reading the
 * dictionary here is a plain import, so these calls run at build time.
 */
const DICTIONARIES: Record<Locale, Dictionary> = { en, ar };

export function staticDictionary(locale: string | undefined): Dictionary {
  return DICTIONARIES[toLocale(locale)];
}

export function staticT(locale: string | undefined): Translator {
  return makeTranslator(staticDictionary(locale));
}

/** The locale for a route segment, falling back to the default. */
export function staticLocale(locale: string | undefined): Locale {
  return toLocale(locale ?? DEFAULT_LOCALE);
}
