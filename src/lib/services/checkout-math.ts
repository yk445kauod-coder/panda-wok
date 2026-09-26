/**
 * Checkout arithmetic shared by the server and the client. It lives outside the
 * server-only service module so the basket preview can import it without
 * pulling server code into the browser bundle. The same functions run inside
 * place_order's validation path, so the previewed total and the stored total
 * cannot drift apart.
 */
export type CheckoutConfig = {
  minOrderTotal: number;
  freeDeliveryOver: number;
  deliveryFee: number;
  etaMinutes: number;
  acceptingOrders: boolean;
  taxRate: number;
  maxQtyPerItem: number;
  loyaltyPointValue: number;
  pointsPerCurrency: number;
  currency: string;
};

export type Totals = {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  pointsEarned: number;
};

/** Rounds to two decimals the way a till would, avoiding float drift. */
export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Subtotal, discount, delivery, tax and total for an order. Redemption is
 * capped at half the subtotal and at the subtotal itself; delivery is free once
 * the free-delivery threshold is met or when the order is a pickup.
 */
export function computeTotals(
  subtotal: number,
  options: {
    fulfillment: "delivery" | "pickup";
    config: CheckoutConfig;
    pointsToRedeem?: number;
  },
): Totals {
  const { fulfillment, config } = options;

  const redeemValue = Math.min(
    Math.max(options.pointsToRedeem ?? 0, 0) * config.loyaltyPointValue,
    roundMoney(subtotal * 0.5),
    subtotal,
  );
  const discount = roundMoney(redeemValue);

  const deliveryFee =
    fulfillment === "pickup"
      ? 0
      : subtotal >= config.freeDeliveryOver
        ? 0
        : config.deliveryFee;

  const taxable = roundMoney(subtotal - discount + deliveryFee);
  const tax = roundMoney(taxable * config.taxRate);
  const total = roundMoney(taxable + tax);

  return {
    subtotal: roundMoney(subtotal),
    discount,
    deliveryFee,
    tax,
    total,
    pointsEarned: Math.floor(total * config.pointsPerCurrency),
  };
}

/** True when the basket meets the kitchen's minimum order value. */
export function meetsMinimum(subtotal: number, config: CheckoutConfig) {
  return subtotal >= config.minOrderTotal;
}
