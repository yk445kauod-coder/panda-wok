import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeatureFlagMap, getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { CartProvider } from "@/components/customer/cart-provider";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageEnter } from "@/components/layout/page-enter";
import { SiteWidgets } from "@/components/layout/site-widgets";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { ViewerProvider } from "@/components/layout/viewer-provider";
import { AssistantProvider } from "@/components/panda/assistant-context";
import { AnalyticsBeacon } from "@/components/customer/analytics-beacon";
import { MetaPixel } from "@/components/customer/meta-pixel";
import { restaurantSchema, websiteSchema, organisationSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { I18nProvider } from "@/components/i18n-provider";
import { DocumentLocale } from "@/components/layout/document-locale";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { dirFor, isLocale, LOCALES, type Locale } from "@/lib/i18n/config";
import { staticDictionary, staticLocale } from "@/lib/i18n/static";
import {
  brandDescription,
  brandName,
  brandTagline,
  localisedPlace,
} from "@/lib/i18n/brand";

/**
 * The customer site, one prerendered tree per locale.
 *
 * Everything the shell needs is either a build-time constant (the dictionary,
 * the `dir`) or a cached public read, so the whole tree — including the header
 * and footer — renders without a request. The two things that genuinely depend
 * on the visitor (the notification bell, the signed-in account links) hydrate
 * on the client, which is what keeps the pages off the Worker's render path.
 */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const settings = await getPublicSettings().catch(() => null);
  const brand = settings?.brand.name ?? "Panda Wok";
  return {
    title: {
      template: `%s | ${brand}`,
      default: locale === "ar" ? `باندا ووك — ${brand}` : brand,
    },
    alternates: { languages: { en: "/en", ar: "/ar" } },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const locale: Locale = lang;
  const dict = staticDictionary(locale);

  const [flags, settings, restaurant] = await Promise.all([
    getFeatureFlagMap(),
    getPublicSettings(),
    getRestaurant(),
  ]);

  const brand = {
    name: brandName(restaurant, locale, settings.brand.name),
    city: localisedPlace(restaurant?.city ?? settings.brand.city, locale),
    country: localisedPlace(restaurant?.country ?? settings.brand.country, locale),
    tagline: brandTagline(restaurant, locale, settings.brand.tagline),
    logo_url: settings.brand.logo_url,
  };

  const structuredData = [
    websiteSchema({ name: brand.name, description: `${brand.tagline}.` }),
    organisationSchema({ name: brand.name, social: settings.support.social }),
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
    <I18nProvider locale={locale} dict={dict}>
      <DocumentLocale locale={locale} />
      <ToastProvider>
        <ConfirmProvider>
          <ViewerProvider>
            <AssistantProvider>
              <CartProvider>
                <div dir={dirFor(locale)} lang={locale} data-locale={locale} className="contents">
                  <div className="flex min-h-dvh flex-col">
                    <SiteHeader brand={brand} flags={flags} locale={locale} />
                    <main id="main" className="flex-1 pb-24 md:pb-0">
                      <PageEnter>{children}</PageEnter>
                    </main>
                    <SiteFooter brand={brand} contact={settings.support} locale={locale} />
                    {flags["nav.bottom"] !== false ? <BottomNav flags={flags} /> : null}
                    {flags.assistant !== false && settings.ai.assistantEnabled ? (
                      <SiteWidgets
                        brandName={brand.name}
                        disclosure={settings.ai.disclosure}
                      />
                    ) : null}
                    <AnalyticsBeacon enabled={flags.analytics !== false} />
                    <MetaPixel pixelId={settings.marketing.metaPixelId} />
                  </div>
                  <JsonLdScript data={structuredData} />
                </div>
              </CartProvider>
            </AssistantProvider>
          </ViewerProvider>
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
