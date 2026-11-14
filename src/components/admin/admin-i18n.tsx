"use client";

import { I18nProvider } from "@/components/i18n-provider";
import { en } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/config";

/**
 * Locale for the console SPA.
 *
 * The console used to receive its dictionary from a server component (so only
 * the active language shipped). Now that `/admin` is a static shell, the
 * dictionary is bundled and chosen in the browser — the trade is a little more
 * JavaScript for a Worker that no longer renders the console on every request.
 */
export function AdminI18n({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <I18nProvider locale={locale} dict={locale === "ar" ? ar : en}>
      {children}
    </I18nProvider>
  );
}
