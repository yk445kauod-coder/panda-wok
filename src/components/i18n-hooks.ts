"use client";

import { useCallback } from "react";
import { useI18n } from "@/components/i18n-provider";
import { localePath } from "@/lib/i18n/config";

/**
 * Locale-aware link builder for client components.
 *
 * Every customer link must carry the locale segment (`/ar/menu`), because the
 * pages are prerendered per locale and a bare path would cost a redirect. The
 * active locale comes from the i18n provider, which the `[lang]` layout seeds.
 */
export function useLocalePath(): (path: string) => string {
  const { locale } = useI18n();
  return useCallback((path: string) => localePath(locale, path), [locale]);
}
