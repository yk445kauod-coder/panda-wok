import "server-only";

import { getPublicMenu, getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { getEnabledRewards } from "@/lib/services/catalog";
import { listOffers } from "@/lib/services/admin-catalog";
import type { MenuItem, Category } from "@/lib/services/catalog";

export type GroundingSnapshot = {
  brand: {
    name: string;
    city: string;
    country: string;
    cuisine: string;
    tagline: string;
  };
  contact: {
    phone: string | null;
    phoneSecondary: string | null;
    email: string | null;
    social: Record<string, string>;
    /** Live InstaPay payment link, published from Admin → Settings. */
    instapayUrl: string | null;
  };
  ordering: {
    minOrderTotal: number;
    deliveryFee: number;
    freeDeliveryOver: number;
    etaMinutes: number;
    acceptingOrders: boolean;
  };
  categories: { slug: string; name: string; description: string | null }[];
  items: {
    slug: string;
    name: string;
    /** Arabic name, used to match and render an Arabic question's dish cards. */
    nameAr: string | null;
    category: string;
    price: number;
    description: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
    available: boolean;
    spicy: boolean;
    vegetarian: boolean;
    vegan: boolean;
    containsNuts: boolean;
    allergens: string[];
    calories: number | null;
  }[];
  rewards: { name: string; pointsCost: number; description: string | null }[];
  loyalty: { pointsPerCurrency: number; pointValue: number };
  paymentMethods: string[];
  /** Enabled offers from the live DB, so the assistant can quote real promotions. */
  offers: { name: string; kind: string; threshold: number; value: number; maxDiscount: number | null }[];
};

/**
 * Builds the single source of truth handed to the model. Everything the
 * assistant is allowed to say comes from here, so it cannot invent a dish,
 * price or claim that is not in the live database.
 */
export async function buildGroundingSnapshot(): Promise<GroundingSnapshot> {
  const [menu, settings, restaurant, rewards, offers] = await Promise.all([
    getPublicMenu(),
    getPublicSettings(),
    getRestaurant(),
    getEnabledRewards(),
    listOffers(),
  ]);

  const enabledOffers = offers
    .filter((o) => o.is_enabled)
    .map((o) => ({
      name: o.name_en,
      kind: o.kind,
      threshold: Number(o.threshold),
      value: Number(o.value),
      maxDiscount: o.max_discount === null ? null : Number(o.max_discount),
    }));

  const categoryName = new Map<string, string>(
    menu.categories.map((c: Category) => [c.id, c.name_en]),
  );

  return {
    brand: {
      name: restaurant?.name_en ?? settings.brand.name,
      city: restaurant?.city ?? settings.brand.city,
      country: restaurant?.country ?? settings.brand.country,
      cuisine: settings.brand.cuisine,
      tagline: restaurant?.tagline_en ?? settings.brand.tagline,
    },
    contact: {
      phone: settings.support.phone,
      phoneSecondary: settings.support.phoneSecondary,
      email: settings.support.email,
      social: settings.support.social,
      instapayUrl: settings.support.instapayUrl,
    },
    ordering: settings.ordering,
    categories: menu.categories.map((c) => ({
      slug: c.slug,
      name: c.name_en,
      description: c.description_en,
    })),
    items: menu.items.map((item: MenuItem) => ({
      slug: item.slug,
      name: item.name_en,
      nameAr: item.name_ar,
      category: categoryName.get(item.category_id) ?? "Menu",
      price: Number(item.price),
      description: item.description_en,
      imageUrl: item.image_url,
      imageAlt: item.image_alt,
      available: item.is_available,
      spicy: item.is_spicy,
      vegetarian: item.is_vegetarian,
      vegan: item.is_vegan,
      containsNuts: item.contains_nuts,
      allergens: item.allergens ?? [],
      calories: item.calories,
    })),
    rewards: rewards.map((r) => ({
      name: r.name_en,
      pointsCost: r.points_cost,
      description: r.description_en,
    })),
    loyalty: settings.loyalty,
    paymentMethods: ["Cash on delivery", "InstaPay"],
    offers: enabledOffers,
  };
}

/** Serialises the snapshot for the model prompt, omitting empty sections. */
export function renderSnapshot(snapshot: GroundingSnapshot): string {
  const lines: string[] = [];

  lines.push("=== RESTAURANT ===");
  lines.push(`Name: ${snapshot.brand.name}`);
  lines.push(`Tagline: ${snapshot.brand.tagline}`);
  lines.push(`Cuisine: ${snapshot.brand.cuisine}`);
  lines.push(`Located in: ${snapshot.brand.city}, ${snapshot.brand.country}`);
  lines.push(
    "Contact: " +
      [
        snapshot.contact.phone ? `phone ${snapshot.contact.phone}` : "phone not published yet",
        snapshot.contact.phoneSecondary
          ? `second phone line ${snapshot.contact.phoneSecondary}`
          : null,
        snapshot.contact.email ? `email ${snapshot.contact.email}` : "email not published yet",
      ]
        .filter(Boolean)
        .join(", "),
  );
  const socialEntries = Object.entries(snapshot.contact.social);
  if (socialEntries.length > 0) {
    lines.push(
      "Social: " +
        socialEntries.map(([k, v]) => `${k} ${v}`).join(", "),
    );
  }
  if (snapshot.contact.instapayUrl) {
    lines.push(`InstaPay payment link: ${snapshot.contact.instapayUrl}`);
  }

  lines.push("");
  lines.push("=== ORDERING ===");
  lines.push(
    `Minimum order: ${snapshot.ordering.minOrderTotal} EGP. Delivery: ${
      snapshot.ordering.deliveryFee === 0
        ? "free"
        : `${snapshot.ordering.deliveryFee} EGP, free over ${snapshot.ordering.freeDeliveryOver} EGP`
    }.`,
  );
  lines.push(`Typical delivery time: about ${snapshot.ordering.etaMinutes} minutes.`);
  lines.push(
    `Currently accepting orders: ${snapshot.ordering.acceptingOrders ? "yes" : "no"}`,
  );
  lines.push(`Payment: ${snapshot.paymentMethods.join(", ")}`);

  if (snapshot.offers.length > 0) {
    lines.push("");
    lines.push("=== CURRENT OFFERS ===");
    for (const offer of snapshot.offers) {
      const value =
        offer.kind === "percent"
          ? `${offer.value}% off${offer.maxDiscount ? ` (up to ${offer.maxDiscount} EGP)` : ""}`
          : `${offer.value} EGP off`;
      lines.push(
        `Offer: ${offer.name} — ${value}${
          offer.threshold > 0 ? ` on orders over ${offer.threshold} EGP` : " on any order"
        }`,
      );
    }
  }

  lines.push("");
  lines.push("=== LOYALTY ===");
  lines.push(
    `Earn ${snapshot.loyalty.pointsPerCurrency} point(s) per 1 EGP spent. 1 point is worth ${snapshot.loyalty.pointValue} EGP when redeemed.`,
  );
  for (const reward of snapshot.rewards) {
    lines.push(
      `Reward: ${reward.name} costs ${reward.pointsCost} points${reward.description ? ` — ${reward.description}` : ""}`,
    );
  }

  lines.push("");
  lines.push("=== MENU ===");
  for (const category of snapshot.categories) {
    const items = snapshot.items.filter((i) => i.category === category.name);
    if (items.length === 0) continue;
    lines.push(`-- ${category.name}${category.description ? `: ${category.description}` : ""}`);
    for (const item of items) {
      const flags = [
        item.available ? "available" : "UNAVAILABLE right now",
        item.spicy ? "spicy" : null,
        item.vegan ? "vegan" : item.vegetarian ? "vegetarian" : null,
        item.containsNuts ? "contains nuts" : null,
      ].filter(Boolean);
      lines.push(
        `  ${item.name} (${item.slug}) — ${item.price} EGP — ${flags.join(", ")}` +
          (item.allergens.length > 0 ? ` — allergens: ${item.allergens.join(", ")}` : "") +
          (item.description ? ` — ${item.description}` : ""),
      );
    }
  }

  lines.push("");
  lines.push("Items not listed above do not exist on the current menu.");

  return lines.join("\n");
}
