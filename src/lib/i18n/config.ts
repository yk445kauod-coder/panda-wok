/**
 * Locale catalogue. English is the default and the fallback for any missing
 * translation; Arabic drives RTL layout. The set is deliberately two entries —
 * the database stores `profiles.locale` with a matching CHECK constraint, so
 * adding a language here means adding it there too.
 */
export const LOCALES = ["en", "ar"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * The ops console and the AI agent open in Arabic by default. Staff read the
 * console during service, on a phone, in Egypt — English-first was an accident
 * of the customer site's default, not a decision about the back office. An
 * explicit switcher choice or a saved profile preference still wins; this is
 * only the fallback when neither exists.
 */
export const ADMIN_DEFAULT_LOCALE: Locale = "ar";

/** Cookie that remembers the visitor's choice across sessions. */
export const LOCALE_COOKIE = "panda-wok.locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};

/** Shown inside the switcher, where space is tight. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  ar: "ع",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Coerces anything (header, cookie, DB value) to a supported locale. */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * The locale a public path already carries, e.g. `/ar/menu` → `ar`, or null
 * when the path has no locale segment. Used to decide whether a request still
 * needs rewriting to a locale-specific tree.
 */
export function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split("/")[1];
  return isLocale(segment) ? segment : null;
}

/**
 * Prefixes an internal public path with its locale: `localePath("ar", "/menu")`
 * → `/ar/menu`, `localePath("en", "/")` → `/en`. Every customer-facing link and
 * redirect goes through this so no bare path is ever produced, which is what
 * keeps the statically prerendered per-locale pages reachable.
 */
export function localePath(locale: Locale, path: string): string {
  const clean = path === "" || path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

/** Removes a leading locale segment: `stripLocale("/ar/menu")` → `/menu`. */
export function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/(en|ar)(?=\/|$)/);
  if (!match) return pathname;
  return pathname.slice(match[0].length) || "/";
}

/**
 * Picks the best supported locale from an Accept-Language header, honouring
 * q-values without pulling in a dependency. Used only as the first-visit
 * guess; an explicit cookie or profile preference always wins.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
