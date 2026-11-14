"use client";

import { useEffect, useState } from "react";
import { I18nProvider } from "@/components/i18n-provider";
import { en, type Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";

/**
 * Locale for the console SPA.
 *
 * The console is a static shell, so the dictionary is chosen in the browser
 * rather than handed down by a server component. Both languages used to be
 * imported statically, which put the Arabic dictionary in the first-load bundle
 * of every console page even for an English operator (and vice versa) — ~31 KB
 * gzip that most sessions never read. Only the active locale is imported now;
 * English is the built-in fallback while the Arabic chunk is in flight.
 */
export function AdminI18n({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  // English ships in the shell and is the fallback; Arabic streams in below.
  const [dict, setDict] = useState<Dictionary>(en);

  useEffect(() => {
    if (locale !== "ar") return;
    let cancelled = false;
    void import("@/lib/i18n/dictionaries/ar").then((m) => {
      if (!cancelled) setDict(m.ar);
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
