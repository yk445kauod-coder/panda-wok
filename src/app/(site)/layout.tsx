import type { Metadata } from "next";
import { getFeatureFlagMap, getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { CartProvider } from "@/components/customer/cart-provider";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { FloatingPanda } from "@/components/layout/floating-panda";
import { PandaAssistant } from "@/components/panda/assistant";
import { AssistantProvider } from "@/components/panda/assistant-context";
import { AnalyticsBeacon } from "@/components/customer/analytics-beacon";
import { buildMetadata } from "@/lib/seo/metadata";
import { restaurantSchema, websiteSchema, organisationSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";

/**
 * Public catalogue metadata is DB-driven, so update it on a short interval
 * rather than serving stale titles after a menu change.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  return buildMetadata({
    title: `${settings.brand.name} — Asian kitchen in ${settings.brand.city}`,
    description: `${settings.brand.tagline}. Order wok, ramen and sushi for delivery in ${settings.brand.city}, ${settings.brand.country}.`,
    path: "/",
    siteName: settings.brand.name,
  });
}

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [flags, settings, restaurant] = await Promise.all([
    getFeatureFlagMap(),
    getPublicSettings(),
    getRestaurant(),
  ]);

  const brand = {
    name: restaurant?.name_en ?? settings.brand.name,
    city: restaurant?.city ?? settings.brand.city,
    country: restaurant?.country ?? settings.brand.country,
    tagline: restaurant?.tagline_en ?? settings.brand.tagline,
    logo_url: settings.brand.logo_url,
  };

  const structuredData = [
    websiteSchema({
      name: brand.name,
      description: `${brand.tagline}. Asian cloud kitchen in ${brand.city}.`,
    }),
    organisationSchema({
      name: brand.name,
      social: settings.support.social,
    }),
    restaurantSchema({
      name: brand.name,
      description: restaurant?.description_en ?? null,
      tagline: restaurant?.tagline_en ?? null,
      cuisineTags: restaurant?.cuisine_tags ?? [],
      city: restaurant?.city ?? null,
      country: restaurant?.country ?? null,
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
          <SiteHeader flags={flags} />
          <main id="main" className="flex-1 pb-24 md:pb-0">
            {children}
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
