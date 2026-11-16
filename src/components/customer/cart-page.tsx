"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { useLocalePath } from "@/components/i18n-hooks";
import { usePublicData } from "@/lib/public/client";
import { useStore } from "@/components/customer/store-data";
import { PageLoading } from "@/components/ui/page-states";
import { EmptyState } from "@/components/ui/empty-state";
import { CartView } from "@/components/customer/cart-view";
import type { CheckoutConfig } from "@/lib/services/order-status";

/**
 * Cart, rendered from the client store plus the checkout preview endpoint.
 *
 * The preview numbers (`tax.rate`, the per-item cap) are not public settings,
 * so they arrive from `/api/public/cart` rather than the bootstrap payload.
 * Both reads are client-side now, so the Worker serves a constant document.
 */
export function CartPage() {
  const { t } = useI18n();
  const lp = useLocalePath();
  const { data, loading } = useStore();
  const { data: config } = usePublicData<CheckoutConfig>("/api/public/cart");

  if (loading && !data) return <PageLoading />;
  if (!data) return null;

  const { flags, settings, locale } = data;

  if (flags.ordering === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title={t("cart.paused")}
          description={t("cart.pausedBody")}
          action={
            <Link
              href={lp("/contact")}
              className="text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
            >
              {t("common.contactKitchen")}
            </Link>
          }
        />
      </div>
    );
  }

  if (!config) return <PageLoading />;

  return (
    <CartView
      config={config}
      acceptingOrders={settings.ordering.acceptingOrders}
      locale={locale}
    />
  );
}
