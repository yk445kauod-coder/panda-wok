"use client";

import { useEffect, useState } from "react";
import { I18nProvider } from "@/components/i18n-provider";
import { consoleEn } from "@/lib/i18n/dictionaries/console-en";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";

/**
 * Locale for the console SPA.
 *
 * The console is a static shell, so the dictionary is chosen in the browser
 * rather than handed down by a server component.
 *
 * It renders only the console slice of the dictionary — `console-en` /
 * `console-ar`, holding `common`, `errors`, `kds` and `admin`. The storefront
 * blocks (menu, cart, checkout, legal…) are ~34 KB the console can never read,
 * and importing the full dictionary put them in the first load of every console
 * page in both languages. Only the active locale is imported; English is the
 * built-in fallback while the Arabic slice is in flight.
 */
export function AdminI18n({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  // English ships in the shell and is the fallback; Arabic streams in below.
  const [dict, setDict] = useState<Dictionary>(consoleEn as Dictionary);

  useEffect(() => {
    if (locale !== "ar") return;
    let cancelled = false;
    void import("@/lib/i18n/dictionaries/console-ar").then((m) => {
      if (!cancelled) setDict(m.consoleAr as Dictionary);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (
    <I18nProvider locale={locale} dict={dict}>
      {children}
    </I18nProvider>
  );
}
