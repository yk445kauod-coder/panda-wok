import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { getCheckoutConfig } from "@/lib/services/order-status";
import { getFeatureFlagMap, getPublicSettings } from "@/lib/services/catalog";
import { CartView } from "@/components/customer/cart-view";
import { EmptyState } from "@/components/ui/empty-state";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, settings] = await Promise.all([getLocale(), getPublicSettings()]);
  const t = await getT(locale);
  return buildMetadata({
    title: t("cart.metaTitle"),
    description: t("cart.metaDescription", { brand: settings.brand.name }),
    path: "/cart",
    siteName: settings.brand.name,
    locale,
    noIndex: true,
  });
}

export default async function CartPage() {
  const [flags, config, settings, locale] = await Promise.all([
    getFeatureFlagMap(),
    getCheckoutConfig(),
    getPublicSettings(),
    getLocale(),
  ]);
  const t = await getT(locale);

  if (flags.ordering === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title={t("cart.paused")}
          description={t("cart.pausedBody")}
          action={
            <Link href="/contact" className="text-sm font-medium text-vermilion-600 hover:text-vermilion-700">
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
