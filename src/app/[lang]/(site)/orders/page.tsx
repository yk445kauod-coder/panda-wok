import type { Metadata } from "next";
import { OrdersPage } from "@/components/customer/orders-page";
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
    title: t("orders.metaTitle"),
    description: t("orders.metaDescription", { brand: settings.brand.name }),
    path: localePath(locale, "/orders"),
    noIndex: true,
    locale,
  });
}

/** Static shell; the order history arrives in the browser. */
export default function Page() {
  return <OrdersPage />;
}
