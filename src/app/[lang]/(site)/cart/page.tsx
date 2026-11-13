import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { getCheckoutConfig } from "@/lib/services/order-status";
import { getFeatureFlagMap, getPublicSettings } from "@/lib/services/catalog";
import { CartView } from "@/components/customer/cart-view";
import { EmptyState } from "@/components/ui/empty-state";
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

export default async function CartPage({ params }: PageProps) {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const t = staticT(locale);
  const [flags, config, settings] = await Promise.all([
    getFeatureFlagMap(),
    getCheckoutConfig(),
    getPublicSettings(),
  ]);

  if (flags.ordering === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title={t("cart.paused")}
          description={t("cart.pausedBody")}
          action={
            <Link href={localePath(locale, "/contact")} className="text-sm font-medium text-vermilion-600 hover:text-vermilion-700">
              {t("common.contactKitchen")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <CartView
      config={config}
      acceptingOrders={settings.ordering.acceptingOrders}
      locale={locale}
    />
  );
}
