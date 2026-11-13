"use client";

import { useEffect } from "react";
import { dirFor, type Locale } from "@/lib/i18n/config";

/**
 * Mirrors the route locale onto the document element.
 *
 * The root layout is shared by every route and cannot read cookies or headers
 * without turning the whole site dynamic, so it renders neutral `lang="en"` /
 * `dir="ltr"`. The `[lang]` layout knows the locale from the URL and wraps the
 * page in a `dir`-carrying element, but the scrollbar side and any fixed
 * (viewport-anchored) element still read the document element, so the two
 * attributes are synced here on mount.
 */
export function DocumentLocale({ locale }: { locale: Locale }) {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = dirFor(locale);
    root.dataset.locale = locale;
  }, [locale]);

  return null;
}
