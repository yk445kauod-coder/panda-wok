"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { useLocalePath } from "@/components/i18n-hooks";
import { usePublicData } from "@/lib/public/client";
import { useStore } from "@/components/customer/store-data";
import { PageLoading } from "@/components/ui/page-states";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckoutFlow } from "@/components/customer/checkout-flow";
import type { CheckoutConfig } from "@/lib/services/order-status";
import type { Address } from "@/lib/services/orders";

type CheckoutData = {
  config: CheckoutConfig;
  acceptingOrders: boolean;
  addresses: Address[];
  defaultAddressId: string | null;
  customerPhone: string | null;
  instapayUrl: string | null;
  previousOrders: number;
};

/**
 * Checkout, rendered from the client store.
 *
 * The server page awaited the session, the config, the settings and the
 * addresses before it could render; the shell is a constant now and the browser
 * asks `/api/public/me/checkout`. A 401 replaces the old `redirect()` to
 * sign-in, and the ordering-off empty state keys on the same flag.
 */
export function CheckoutPage() {
  const { t } = useI18n();
  const lp = useLocalePath();
  const router = useRouter();
  const { data: store, loading: storeLoading } = useStore();
  const signInHref = `/auth/sign-in?next=${encodeURIComponent(lp("/checkout"))}`;
  const { data, loading } = usePublicData<CheckoutData>("/api/public/me/checkout", undefined, {
    onUnauthorized: () => router.replace(signInHref),
  });

  useEffect(() => {
    if (store && store.flags.ordering === false) return;
  }, [store]);

  if (store?.flags.ordering === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title={t("cart.paused")}
          description={t("checkout.errors.closed")}
          action={
            <Link href={lp("/contact")} className="text-sm font-medium text-vermilion-600">
              {t("common.contactKitchen")}
            </Link>
          }
        />
      </div>
    );
  }

  if ((loading || storeLoading) && !data) return <PageLoading />;
  if (!data || !store) return null;

  return (
    <CheckoutFlow
      config={data.config}
      acceptingOrders={data.acceptingOrders}
      addresses={data.addresses}
      defaultAddressId={data.defaultAddressId}
      customerPhone={data.customerPhone}
      instapayUrl={data.instapayUrl}
      previousOrders={data.previousOrders}
      locale={store.locale}
    />
  );
}
