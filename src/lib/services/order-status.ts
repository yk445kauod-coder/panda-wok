import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/services/catalog";
import type { CheckoutConfig } from "@/lib/services/checkout-math";

export type { CheckoutConfig, Totals } from "@/lib/services/checkout-math";
export { computeTotals, meetsMinimum } from "@/lib/services/checkout-math";

// The state machine and its labels live in a client-safe module so the status
// control shares the exact same rules the server enforces.
export * from "@/lib/services/order-workflow";

/**
 * Server-computed checkout configuration. The client uses these numbers only to
 * preview totals; place_order recomputes everything on the way in.
 */
export async function getCheckoutConfig(): Promise<CheckoutConfig> {
  const settings = await getPublicSettings();
  const supabase = await createServerSupabase();

  // tax.rate and max qty are intentionally not public settings, so read the
  // numeric defaults through the settings table as staff would. When the caller
  // is a customer these keys are absent and we fall back to the same defaults
  // that place_order uses, keeping the preview honest.
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["tax.rate", "ordering.max_qty_per_item"]);

  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const readNumber = (key: string, fallback: number) => {
    const v = map.get(key);
    if (typeof v === "number") return v;
    if (typeof v === "string" && Number.isFinite(Number(v))) return Number(v);
    return fallback;
  };

  return {
    minOrderTotal: settings.ordering.minOrderTotal,
    freeDeliveryOver: settings.ordering.freeDeliveryOver,
    deliveryFee: settings.ordering.deliveryFee,
    etaMinutes: settings.ordering.etaMinutes,
    acceptingOrders: settings.ordering.acceptingOrders,
    taxRate: readNumber("tax.rate", 0.14),
    maxQtyPerItem: readNumber("ordering.max_qty_per_item", 20),
    loyaltyPointValue: settings.loyalty.pointValue,
    pointsPerCurrency: settings.loyalty.pointsPerCurrency,
    currency: "EGP",
  };
}
