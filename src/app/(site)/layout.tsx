import type { Metadata } from "next";
import { getFeatureFlagMap, getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { CartProvider } from "@/components/customer/cart-provider";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageEnter } from "@/components/layout/page-enter";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { FloatingPanda } from "@/components/layout/floating-panda";
import { PandaAssistant } from "@/components/panda/assistant";
import { AssistantProvider } from "@/components/panda/assistant-context";
import { AnalyticsBeacon } from "@/components/customer/analytics-beacon";
import { buildMetadata } from "@/lib/seo/metadata";
import { restaurantSchema, websiteSchema, organisationSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { getLocale, getT } from "@/lib/i18n/server";
import {
  brandDescription,
  brandName,
  brandTagline,
  localisedPlace,
} from "@/lib/i18n/brand";

/**
 * Public catalogue metadata is DB-driven, so update it on a short interval
 * rather than serving stale titles after a menu change.
 */

export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([getPublicSettings(), getLocale()]);
  const t = await getT(locale);
  return buildMetadata({
    title: t("home.metaTitle", {
      brand: settings.brand.name,
      tagline: settings.brand.tagline,
    }),
    description: t("home.metaDescription", {
      tagline: settings.brand.tagline,
      brand: settings.brand.name,
      city: settings.brand.city,
    }),
    path: "/",
    siteName: settings.brand.name,
    locale,
  });
}

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [flags, settings, restaurant, locale] = await Promise.all([
    getFeatureFlagMap(),
    getPublicSettings(),
    getRestaurant(),
    getLocale(),
  ]);

  const brand = {
    name: brandName(restaurant, locale, settings.brand.name),
    city: localisedPlace(restaurant?.city ?? settings.brand.city, locale),
    country: localisedPlace(restaurant?.country ?? settings.brand.country, locale),
    tagline: brandTagline(restaurant, locale, settings.brand.tagline),
    logo_url: settings.brand.logo_url,
  };

  const structuredData = [
    websiteSchema({
      name: brand.name,
      description: `${brand.tagline}.`,
    }),
    organisationSchema({
      name: brand.name,
      social: settings.support.social,
    }),
    restaurantSchema({
      name: brand.name,
      description: brandDescription(restaurant, locale, "") || null,
      tagline: brand.tagline,
      cuisineTags: restaurant?.cuisine_tags ?? [],
      city: restaurant?.city ?? settings.brand.city,
      country: restaurant?.country ?? settings.brand.country,
      area: restaurant?.area ?? null,
      latitude: restaurant?.latitude ?? null,
      longitude: restaurant?.longitude ?? null,
      phone: settings.support.phone,
      email: settings.support.email,
      social: settings.support.social,
      openingHours: (settings.support.openingHours ?? {}) as Record<string, unknown>,
      currency: restaurant?.currency ?? "EGP",
    }),
  ];

  return (
    <AssistantProvider>
      <CartProvider>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader brand={brand} flags={flags} />
            <main id="main" className="flex-1 pb-24 md:pb-0">
              <PageEnter>{children}</PageEnter>
            </main>
            <SiteFooter brand={brand} contact={settings.support} />
            {flags["nav.bottom"] !== false ? <BottomNav flags={flags} /> : null}
            {flags.assistant !== false && settings.ai.assistantEnabled ? (
              <>
                <PandaAssistant brandName={brand.name} disclosure={settings.ai.disclosure} />
                <FloatingPanda />
              </>
            ) : null}
            <AnalyticsBeacon enabled={flags.analytics !== false} />
          </div>
        <JsonLdScript data={structuredData} />
      </CartProvider>
    </AssistantProvider>
  );
}
