"use client";

import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { AnalyticsBeacon } from "@/components/customer/analytics-beacon";
import { MetaPixel } from "@/components/customer/meta-pixel";
import { StructuredData } from "@/components/customer/structured-data";
import { useStoreShell } from "@/components/customer/store-data";
import type { Locale } from "@/lib/i18n/config";

/**
 * The header, footer and floating widgets, driven by the client store read.
 *
 * They used to be server components fed by `getPublicSettings`/`getRestaurant`
 * in the layout, which meant the Worker rendered them (and awaited the
 * catalogue) on every document request. They are client components now, so the
 * shell paints immediately from defaults and fills in the brand, contact links
 * and flags the moment the bootstrap response lands.
 */
export function SiteChrome({ locale }: { locale: Locale }) {
  const { brand, contact, flags, settings } = useStoreShell();

  return (
    <>
      <SiteHeader brand={brand} flags={flags} locale={locale} />
      <SiteFooter brand={brand} contact={contact} locale={locale} />
      {flags["nav.bottom"] !== false ? <BottomNav flags={flags} /> : null}
      <AnalyticsBeacon enabled={flags.analytics !== false} />
      <MetaPixel pixelId={settings?.marketing.metaPixelId ?? null} />
      <StructuredData locale={locale} />
    </>
  );
}
