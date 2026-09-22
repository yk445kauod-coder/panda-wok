import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { getCheckoutConfig } from "@/lib/services/order-status";
import { getFeatureFlagMap, getPublicSettings } from "@/lib/services/catalog";
import { CartView } from "@/components/customer/cart-view";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = buildMetadata({
  title: "Your basket",
  description: "Review your Panda Wok basket before checkout.",
  path: "/cart",
  noIndex: true,
});

export default async function CartPage() {
  const [flags, config, settings] = await Promise.all([
    getFeatureFlagMap(),
    getCheckoutConfig(),
    getPublicSettings(),
  ]);

  if (flags.ordering === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title="Ordering is paused"
          description="Online ordering is temporarily switched off. Please contact the kitchen to place an order."
          action={
            <Link href="/contact" className="text-sm font-medium text-plum-600 hover:text-plum-700">
              Contact the kitchen
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
    />
  );
}
