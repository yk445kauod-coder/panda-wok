import type { Metadata } from "next";
import { CheckoutPage } from "@/components/customer/checkout-page";
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
    title: t("checkout.metaTitle"),
    description: t("checkout.metaDescription", { brand: settings.brand.name }),
    path: localePath(locale, "/checkout"),
    siteName: settings.brand.name,
    locale,
    noIndex: true,
  });
}

/** Static shell; checkout reads its own state on the client. */
export default function Page() {
  return <CheckoutPage />;
}
