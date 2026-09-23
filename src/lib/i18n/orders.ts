import type { Locale } from "@/lib/i18n/config";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { en } from "@/lib/i18n/dictionaries/en";
import { makeTranslator } from "@/lib/i18n/translate";
import type { OrderStatus } from "@/lib/services/order-workflow";

/**
 * Customer-facing wording for order states. The workflow module owns the state
 * machine; this owns how each state is described, so the same status reads
 * correctly in both languages on the order list and the tracking page.
 */
const LABEL_KEYS: Record<OrderStatus, string> = {
  new: "status.new",
  accepted: "status.accepted",
  in_progress: "status.in_progress",
  prepared: "status.prepared",
  out_for_delivery: "status.out_for_delivery",
  finished: "status.delivered",
  canceled: "status.canceled",
  rejected: "status.rejected",
  failed: "status.failed",
  refunded: "status.refunded",
};

const HINT_KEYS: Record<OrderStatus, string> = {
  new: "orders.hints.new",
  accepted: "orders.hints.accepted",
  in_progress: "orders.hints.in_progress",
  prepared: "orders.hints.prepared",
  out_for_delivery: "orders.hints.out_for_delivery",
  finished: "orders.hints.finished",
  canceled: "orders.hints.canceled",
  rejected: "orders.hints.rejected",
  failed: "orders.hints.failed",
  refunded: "orders.hints.refunded",
};

export function statusLabel(status: OrderStatus, locale: Locale): string {
  const t = makeTranslator(locale === "ar" ? ar : en);
  return t(LABEL_KEYS[status]);
}

export function statusHint(status: OrderStatus, locale: Locale): string {
  const t = makeTranslator(locale === "ar" ? ar : en);
  return t(HINT_KEYS[status]);
}

/** Human label for a fulfilment or payment enum coming from the database. */
export function fulfilmentLabel(value: string, locale: Locale): string {
  const map: Record<string, { en: string; ar: string }> = {
    delivery: { en: "Delivery", ar: "توصيل" },
    pickup: { en: "Pickup", ar: "استلام" },
  };
  const entry = map[value];
  if (entry) return locale === "ar" ? entry.ar : entry.en;
  return value;
}

export function paymentMethodLabel(value: string, locale: Locale): string {
  const map: Record<string, { en: string; ar: string }> = {
    cash_on_delivery: { en: "Cash on delivery", ar: "نقداً عند التوصيل" },
    card_on_delivery: { en: "Card on delivery", ar: "بطاقة عند التوصيل" },
    online: { en: "Online payment", ar: "دفع إلكتروني" },
  };
  const entry = map[value];
  if (entry) return locale === "ar" ? entry.ar : entry.en;
  return value;
}

export function paymentStatusLabel(value: string, locale: Locale): string {
  const map: Record<string, { en: string; ar: string }> = {
    pending: { en: "unpaid", ar: "غير مدفوع" },
    paid: { en: "paid", ar: "مدفوع" },
    refunded: { en: "refunded", ar: "مُسترد" },
    failed: { en: "failed", ar: "فشل" },
  };
  const entry = map[value];
  if (entry) return locale === "ar" ? entry.ar : entry.en;
  return value;
}
