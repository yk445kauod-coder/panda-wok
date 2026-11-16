import type { Metadata } from "next";
import { CartPage } from "@/components/customer/cart-page";
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
    title: t("cart.metaTitle"),
    description: t("cart.metaDescription", { brand: settings.brand.name }),
    path: localePath(locale, "/cart"),
    siteName: settings.brand.name,
    locale,
    noIndex: true,
  });
}

/** Static shell; the cart reads its data in the browser. */
export default function Page() {
  return <CartPage />;
}
