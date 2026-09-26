import type { PublicSettings } from "@/lib/services/catalog";
import type { T } from "@/lib/i18n/server";

export type FaqEntry = { question: string; answer: string };

/**
 * Builds the customer FAQ from the dictionary plus the kitchen's live settings.
 * Every figure (minimum order, fees, timings, currency) is read from settings
 * rather than hardcoded, so the published answer cannot drift from what
 * checkout actually charges.
 *
 * Ordering is deliberate: the questions a first-time customer asks first come
 * first, and this is also the order used for FAQPage structured data.
 */
export function buildFaq(
  t: T,
  settings: PublicSettings,
  restaurant: { currency?: string | null; cuisine_tags?: string[] | null } | null,
): FaqEntry[] {
  const brand = settings.brand.name;
  const city = settings.brand.city;
  const currency = restaurant?.currency ?? "EGP";
  const cuisine =
    restaurant?.cuisine_tags && restaurant.cuisine_tags.length > 0
      ? restaurant.cuisine_tags.slice(0, 4).join(", ")
      : settings.brand.cuisine;

  const shared = {
    brand,
    city,
    country: settings.brand.country,
    currency,
    cuisine,
    minOrder: `${settings.ordering.minOrderTotal} ${currency}`,
    fee: `${settings.ordering.deliveryFee} ${currency}`,
    freeOver: `${settings.ordering.freeDeliveryOver} ${currency}`,
    minutes: String(settings.ordering.etaMinutes),
  };

  const keys = [
    "where",
    "order",
    "deliveryTime",
    "collection",
    "cuisine",
    "vegetarian",
    "allergens",
    "payment",
    "hours",
    "reservations",
    "account",
  ] as const;

  return keys.map((key) => ({
    question: t(`faq.items.${key}.q`, shared),
    answer: t(`faq.items.${key}.a`, shared),
  }));
}
