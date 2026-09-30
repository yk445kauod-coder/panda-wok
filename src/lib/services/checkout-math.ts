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
  /**
   * Whether the storefront is taking orders *right now*. Resolved from the
   * owner's switch plus the configured opening window, so a customer sees the
   * real state instead of only the manual on/off flag.
   */
  acceptingOrders: boolean;
  /** Why the store is open or closed, and the window it applies to. */
  availability: {
    reason: "open" | "disabled" | "outside_hours" | "manual_override";
    openTime: string;
    closeTime: string;
  };
  taxRate: number;
  maxQtyPerItem: number;
  loyaltyPointValue: number;
  pointsPerCurrency: number;
  currency: string;
  /** Enabled threshold promotions, so the basket can preview the saving. */
  offers: OfferRule[];
};

/**
 * A live promotion. Mirrors the `offers` row shape closely enough to preview
 * the saving without a round trip; `place_order` recomputes it authoritatively.
 */
export type OfferRule = {
  id: string;
  name_en: string;
  name_ar: string | null;
  kind: "percent" | "fixed";
  threshold: number;
  value: number;
  max_discount: number | null;
};

export type AppliedOffer = {
  offer: OfferRule;
  amount: number;
};

export type Totals = {
  subtotal: number;
  discount: number;
  pointsDiscount: number;
  offerDiscount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  pointsEarned: number;
  offer: AppliedOffer | null;
};

/** Rounds to two decimals the way a till would, avoiding float drift. */
export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * The single offer that saves the customer the most on this subtotal.
 *
 * This must stay in lockstep with `public.best_offer` in the database: that
 * function is what actually prices the order, and this one only drives the
 * preview. Same rule — highest saving wins, ties break on `sort_order` then
 * creation order — so a previewed total and the stored total cannot disagree.
 */
export function bestOffer(
  subtotal: number,
  offers: OfferRule[],
): AppliedOffer | null {
  let best: AppliedOffer | null = null;

  for (const offer of offers) {
    if (subtotal < offer.threshold) continue;

    const raw =
      offer.kind === "percent" ? roundMoney((subtotal * offer.value) / 100) : offer.value;
    const capped = Math.min(raw, offer.max_discount ?? Number.POSITIVE_INFINITY);
    const amount = roundMoney(Math.min(capped, subtotal));
    if (amount <= 0) continue;

    if (!best || amount > best.amount) best = { offer, amount };
  }

  return best;
}

/**
 * Subtotal, discount, delivery, tax and total for an order.
 *
 * Discount order matches `place_order`: the customer's own loyalty points are
 * spent first, then the single best threshold offer is applied to the basket
 * subtotal, and the combined discount is clamped so it can never exceed the
 * subtotal. Delivery is free once the free-delivery threshold is met.
 *
 * Every order is delivered — the kitchen is a cloud kitchen with no counter —
 * so there is no pickup branch. The `deliveryFee` field stays in the result
 * shape because it is persisted on the order row.
 */
export function computeTotals(
  subtotal: number,
  options: {
    config: CheckoutConfig;
    pointsToRedeem?: number;
  },
): Totals {
  const { config } = options;

  const redeemValue = Math.min(
    Math.max(options.pointsToRedeem ?? 0, 0) * config.loyaltyPointValue,
    roundMoney(subtotal * 0.5),
    subtotal,
  );
  const pointsDiscount = roundMoney(redeemValue);

  const applied = bestOffer(subtotal, config.offers);
  const offerDiscount = applied?.amount ?? 0;

  const discount = roundMoney(Math.min(pointsDiscount + offerDiscount, subtotal));

  const deliveryFee = subtotal >= config.freeDeliveryOver ? 0 : config.deliveryFee;

  const taxable = roundMoney(subtotal - discount + deliveryFee);
  const tax = roundMoney(taxable * config.taxRate);
  const total = roundMoney(taxable + tax);

  return {
    subtotal: roundMoney(subtotal),
    discount,
    pointsDiscount,
    offerDiscount,
    deliveryFee,
    tax,
    total,
    pointsEarned: Math.floor(total * config.pointsPerCurrency),
    offer: applied,
  };
}

/** True when the basket meets the kitchen's minimum order value. */
export function meetsMinimum(subtotal: number, config: CheckoutConfig) {
  return subtotal >= config.minOrderTotal;
}
