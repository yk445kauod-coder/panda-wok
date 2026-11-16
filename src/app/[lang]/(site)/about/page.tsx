import type { Metadata } from "next";
import { AboutPage } from "@/components/customer/about-page";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { localePath } from "@/lib/i18n/config";
import { staticLocale, staticT } from "@/lib/i18n/static";
import { localisedPlace } from "@/lib/i18n/brand";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const t = staticT(locale);
  const [settings, restaurant] = await Promise.all([
    getPublicSettings(),
    getRestaurant(),
  ]);
  const cuisine = (restaurant?.cuisine_tags ?? []).filter(
    (tag): tag is string => typeof tag === "string",
  );
  return buildMetadata({
    title: t("about.metaTitle", { brand: settings.brand.name }),
    description: t("about.metaDescription", {
      brand: settings.brand.name,
      cuisine: cuisine.slice(0, 3).join(", ") || settings.brand.cuisine,
      city: localisedPlace(settings.brand.city, locale),
      country: localisedPlace(settings.brand.country, locale),
    }),
    path: localePath(locale, "/about"),
    siteName: settings.brand.name,
  });
}

/** Static shell; the copy arrives from the client store. */
export default function Page() {
  return <AboutPage />;
}
