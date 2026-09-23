"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, dirFor, type Locale } from "@/lib/i18n/config";
import { en, type Dictionary } from "@/lib/i18n/dictionaries/en";
import { translate } from "@/lib/i18n/translate";

type I18nValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  dict: Dictionary;
  t: (path: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Client-side locale context. The dictionary is passed down from a server
 * component so no translation JSON ships to the browser beyond the active
 * language, and client components translate with the same `t()` contract as
 * the server.
 */
export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: dirFor(locale),
      dict,
      t: (path, vars) => translate(dict, path, vars),
    }),
    [locale, dict],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Rendering outside the provider should not crash the whole route; fall
    // back to a pass-through translator that echoes keys.
    return {
      locale: DEFAULT_LOCALE,
      dir: "ltr",
      dict: en,
      t: (path, vars) => {
        if (!vars) return path;
        return path.replace(/\{(\w+)\}/g, (match, name: string) =>
          name in vars ? String(vars[name]) : match,
        );
      },
    };
  }
  return ctx;
}

/** Convenience hook for components that only need the translator. */
export function useT() {
  return useI18n().t;
}
