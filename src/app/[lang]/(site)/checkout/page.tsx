import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import { getCheckoutConfig } from "@/lib/services/order-status";
import { getFeatureFlagMap, getPublicSettings } from "@/lib/services/catalog";
import { getMyAddresses, getMyStats } from "@/lib/services/orders";
import { getSession } from "@/lib/auth/session";
import { CheckoutFlow } from "@/components/customer/checkout-flow";
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
    title: t("checkout.metaTitle"),
    description: t("checkout.metaDescription", { brand: settings.brand.name }),
    path: localePath(locale, "/checkout"),
    siteName: settings.brand.name,
    locale,
    noIndex: true,
  });
}

export default async function CheckoutPage({ params }: PageProps) {
  const [{ lang }, session] = await Promise.all([params, getSession()]);
  const locale = staticLocale(lang);
  const t = staticT(locale);
  const flags = await getFeatureFlagMap();

  if (flags.ordering === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title={t("cart.paused")}
          description={t("checkout.errors.closed")}
          action={
            <Link href={localePath(locale, "/contact")} className="text-sm font-medium text-vermilion-600">
              {t("common.contactKitchen")}
            </Link>
          }
        />
      </div>
    );
  }

  // Checkout requires an account so the order belongs to a real profile and
  // the customer can track it.
  if (!session) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(localePath(locale, "/checkout"))}`);
  }

  const [config, settings, addresses, stats] = await Promise.all([
    getCheckoutConfig(),
    getPublicSettings(),
    getMyAddresses(session.user.id),
    getMyStats(session.user.id),
  ]);

  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

  return (
    <CheckoutFlow
      config={config}
      acceptingOrders={settings.ordering.acceptingOrders}
      addresses={addresses}
      defaultAddressId={defaultAddress?.id ?? null}
      customerPhone={session.profile?.phone ?? null}
      instapayUrl={settings.support.instapayUrl}
      previousOrders={stats.orderCount}
      locale={locale}
    />
  );
}
