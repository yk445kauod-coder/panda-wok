import type { Metadata } from "next";
import { HomePage } from "@/components/customer/home-page";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings } from "@/lib/services/catalog";
import { localePath } from "@/lib/i18n/config";
import { staticLocale, staticT } from "@/lib/i18n/static";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const t = staticT(locale);
  const settings = await getPublicSettings();
  return buildMetadata({
    // The home title already ends in the brand name, so it opts out of the root
    // layout's `%s | Panda Wok` template; otherwise the brand is printed twice.
    title: {
      absolute: t("home.metaTitle", {
        brand: settings.brand.name,
        tagline: settings.brand.tagline,
      }),
    },
    description: t("home.metaDescription", {
      tagline: settings.brand.tagline,
      brand: settings.brand.name,
      city: settings.brand.city,
    }),
    path: localePath(locale, "/"),
    keywords: [
      settings.brand.name,
      `food delivery ${settings.brand.city}`,
      `cloud kitchen ${settings.brand.city}`,
    ],
    siteName: settings.brand.name,
    locale,
  });
}

/** Static shell; the storefront composes itself from the client store. */
export default function Page() {
  return <HomePage />;
}
