import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import { getCheckoutConfig } from "@/lib/services/order-status";
import { getFeatureFlagMap, getPublicSettings } from "@/lib/services/catalog";
import { getMyAddresses, getMyStats } from "@/lib/services/orders";
import { getLoyaltyOverview } from "@/lib/services/loyalty";
import { getSession } from "@/lib/auth/session";
import { CheckoutFlow } from "@/components/customer/checkout-flow";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = buildMetadata({
  title: "Checkout",
  description: "Confirm your Panda Wok delivery details and place your order.",
  path: "/checkout",
  noIndex: true,
});

export default async function CheckoutPage() {
  const session = await getSession();
  const flags = await getFeatureFlagMap();

  if (flags.ordering === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title="Ordering is paused"
          description="Online ordering is temporarily switched off. Please contact the kitchen."
          action={
            <Link href="/contact" className="text-sm font-medium text-plum-600">
              Contact the kitchen
            </Link>
          }
        />
      </div>
    );
  }

  // Checkout requires an account so the order belongs to a real profile and
  // the customer can track it.
  if (!session) {
    redirect("/auth/sign-in?next=%2Fcheckout");
  }

  const [config, settings, addresses, stats, loyalty] = await Promise.all([
    getCheckoutConfig(),
    getPublicSettings(),
    getMyAddresses(session.user.id),
    getMyStats(session.user.id),
    getLoyaltyOverview(session.user.id),
  ]);

  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

  return (
    <CheckoutFlow
      config={config}
      acceptingOrders={settings.ordering.acceptingOrders}
      addresses={addresses}
      defaultAddressId={defaultAddress?.id ?? null}
      customerPhone={session.profile?.phone ?? null}
      loyaltyPoints={loyalty.account?.points_balance ?? 0}
      loyaltyTier={loyalty.account?.tier ?? null}
      previousOrders={stats.orderCount}
    />
  );
}
