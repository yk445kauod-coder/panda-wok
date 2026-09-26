import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  toLocale,
  type Locale,
} from "@/lib/i18n/config";
import { en, type Dictionary } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { makeTranslator } from "@/lib/i18n/translate";

const DICTIONARIES: Record<Locale, Dictionary> = { en, ar };

/**
 * Resolves the active locale for the current request, in priority order:
 *   1. the explicit cookie, which is what the switcher and signup write;
 *   2. the signed-in profile preference, for a first visit on a new device;
 *   3. the browser's Accept-Language header;
 *   4. English.
 *
 * Wrapped in `cache` so a request that resolves the locale in the layout and
 * again in a page pays for the cookie/session read only once.
 *
 * Note there is deliberately no `/[lang]` route segment: public URLs stay
 * exactly as they are, so the existing SEO surface and sitemap are untouched.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (fromCookie) return toLocale(fromCookie);

  const session = await getSession();
  if (session?.profile?.locale) return toLocale(session.profile.locale);

  const headerList = await headers();
  return localeFromAcceptLanguage(headerList.get("accept-language")) ?? DEFAULT_LOCALE;
});

export async function getDictionary(locale?: Locale): Promise<Dictionary> {
  return DICTIONARIES[locale ?? (await getLocale())];
}

/**
 * Translator for server components and server actions. `t("menu.title")`
 * walks the dictionary by dotted path and fills `{placeholders}` from the
 * second argument. A missing key returns the key itself rather than throwing,
 * so a forgotten translation degrades to something debuggable instead of
 * crashing the page.
 */
export async function getT(locale?: Locale) {
  const dict = await getDictionary(locale);
  return makeTranslator(dict);
}

export type T = ReturnType<typeof makeTranslator>;

export { DEFAULT_LOCALE };
