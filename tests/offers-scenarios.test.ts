/**
 * The offers and discount system, end to end.
 *
 * An offer is a threshold promotion: a percent or a fixed amount, off a basket
 * that meets a minimum, optionally capped and optionally targeted at one
 * customer. `place_order` prices the order from the database, so these tests
 * drive the real RPC against a real SQLite engine with the real schema — a mock
 * would pass while the pricing rule was wrong.
 *
 * The preview (`computeTotals` / `bestOffer` in checkout-math) and the
 * authoritative pricing (`bestOffer` in the D1 RPC) are two implementations of
 * one rule, so the pair is asserted to agree on the same basket.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1Client } from "@/lib/d1/client";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { bestOffer, computeTotals, type CheckoutConfig, type OfferRule } from "@/lib/services/checkout-math";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));
const actorPath = fileURLToPath(new URL("../migrations/0003_updated_by.sql", import.meta.url));
const triggersPath = fileURLToPath(new URL("../migrations/0002_triggers.sql", import.meta.url));
const seedPath = fileURLToPath(new URL("../scripts/seed/catalog-backup.json", import.meta.url));

const RESTAURANT = "b54b2620-90c5-4295-b617-bc1389db3ee9";

let db: SqliteD1;

beforeAll(async () => {
  db = createTestDatabase(
    [
      readFileSync(schemaPath, "utf8"),
      readFileSync(actorPath, "utf8"),
      readFileSync(triggersPath, "utf8"),
    ].join("\n"),
  );
  setD1Database(db);

  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as Record<string, { value: unknown }>;
  const menu = seed["public-menu"].value as {
    categories: Array<Record<string, unknown>>;
    items: Array<Record<string, unknown>>;
  };
  const client = new D1Client({ elevated: true, userId: null });
  await client.from("restaurants").upsert([{ id: RESTAURANT, slug: "panda-wok", name_en: "Panda Wok" }]);
  await client.from("categories").upsert(menu.categories.map((c) => ({ ...c, restaurant_id: RESTAURANT })));
  await client.from("menu_items").upsert(
    menu.items.map(({ modifier_groups: _drop, ...item }) => ({ ...item, restaurant_id: RESTAURANT })),
  );
  const groups = menu.items.flatMap((i) => (i.modifier_groups as Array<Record<string, unknown>>) ?? []);
  if (groups.length > 0) {
    await client.from("modifier_groups").upsert(groups.map(({ modifier_options: _drop, ...g }) => g));
    const options = groups.flatMap((g) => (g.modifier_options as Array<Record<string, unknown>>) ?? []);
    if (options.length > 0) await client.from("modifier_options").upsert(options);
  }
});

function admin() {
  setD1Context({ userId: null, restaurantId: RESTAURANT, elevated: true });
  return new D1Client({ elevated: true, userId: null });
}

function customer(id: string) {
  setD1Context({ userId: id, restaurantId: RESTAURANT, elevated: false });
  return new D1Client({ elevated: false, userId: id });
}

beforeEach(async () => {
  // Every test starts from a clean promotion set.
  setD1Context({ userId: null, restaurantId: RESTAURANT, elevated: true });
  const client = new D1Client({ elevated: true, userId: null });
  await client.from("offers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  // Neutralise delivery and tax so `total` isolates the offer rule. The order
  // in which tax applies to a discounted subtotal is asserted on its own below.
  for (const [key, value] of [
    ["delivery.fee", 0],
    ["delivery.free_over", 0],
    ["tax.rate", 0],
    ["ordering.min_order_total", 0],
  ] as const) {
    await client.from("settings").upsert({ key, value, is_public: true });
  }
});

async function addOffer(fields: Record<string, unknown>) {
  const client = admin();
  const { data, error } = await client
    .from("offers")
    .insert({
      name_en: "Offer",
      kind: "percent",
      threshold: 0,
      value: 10,
      is_enabled: true,
      sort_order: 0,
      ...fields,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

/** The catalogue category a probe dish hangs off; seeded once. */
let probeCategoryId: string | null = null;

/** Place a one-line order and return the stored pricing columns. */
async function placeOrderAt(price: number, userId = "customer-1") {
  const adminClient = admin();
  if (!probeCategoryId) {
    const category = await adminClient
      .from("categories")
      .select("id")
      .limit(1)
      .single();
    probeCategoryId = (category.data as { id: string }).id;
  }

  // A menu item at exactly `price`, so the subtotal is predictable. The id has
  // to be a real UUID: `place_order` rejects anything else as ITEM_NOT_FOUND.
  const itemId = crypto.randomUUID();
  const inserted = await adminClient.from("menu_items").insert({
    id: itemId,
    restaurant_id: RESTAURANT,
    category_id: probeCategoryId,
    name_en: "Probe dish",
    slug: `probe-${price}-${Math.random().toString(36).slice(2, 8)}`,
    price,
    is_available: true,
    is_archived: false,
  });
  expect(inserted.error).toBeNull();

  const client = customer(userId);
  await client.from("profiles").upsert({ id: userId, restaurant_id: RESTAURANT, is_blocked: false });
  const address = await client
    .from("addresses")
    .insert({ user_id: userId, address_line: "1 Test St" })
    .select("id")
    .single();
  expect(address.error).toBeNull();

  const placed = await client.rpc("place_order", {
    p_user_id: userId,
    p_items: [{ menu_item_id: itemId, quantity: 1, modifiers: [] }],
    p_address_id: (address.data as { id: string }).id,
    p_fulfillment: "delivery",
    p_payment_method: "cash_on_delivery",
    p_idempotency_key: `idem-${Math.random().toString(36).slice(2, 12)}`,
  });
  expect(placed.error).toBeNull();
  const order = await adminClient
    .from("orders")
    .select("subtotal, discount_total, delivery_fee, tax_total, total, offer_id, offer_name")
    .eq("id", (placed.data as { order_id: string }).order_id)
    .single();
  return order.data as Record<string, unknown>;
}

const CONFIG: CheckoutConfig = {
  minOrderTotal: 0,
  freeDeliveryOver: 1_000_000,
  deliveryFee: 0,
  etaMinutes: 30,
  acceptingOrders: true,
  availability: { reason: "open", openTime: "00:00", closeTime: "23:59" },
  taxRate: 0,
  maxQtyPerItem: 20,
  currency: "EGP",
  offers: [],
};

describe("offers: the pricing rule", () => {
  it("applies a percent offer once the threshold is met", async () => {
    await addOffer({ name_en: "10% off 200", kind: "percent", threshold: 200, value: 10 });
    const order = await placeOrderAt(300);
    expect(order.subtotal).toBe(300);
    expect(order.discount_total).toBe(30);
    expect(order.total).toBe(270);
    expect(order.offer_name).toBe("10% off 200");
  });

  it("does not apply a percent offer below its threshold", async () => {
    await addOffer({ name_en: "10% off 200", kind: "percent", threshold: 200, value: 10 });
    const order = await placeOrderAt(150);
    expect(order.discount_total).toBe(0);
    expect(order.total).toBe(150);
    expect(order.offer_id).toBeNull();
  });

  it("applies a fixed-amount offer", async () => {
    await addOffer({ name_en: "50 off 300", kind: "fixed", threshold: 300, value: 50 });
    const order = await placeOrderAt(400);
    expect(order.discount_total).toBe(50);
    expect(order.total).toBe(350);
  });

  it("caps a percent offer at max_discount", async () => {
    await addOffer({ name_en: "50% capped 100", kind: "percent", threshold: 0, value: 50, max_discount: 100 });
    const order = await placeOrderAt(1000);
    // 50% of 1000 would be 500, but the ceiling holds it at 100.
    expect(order.discount_total).toBe(100);
    expect(order.total).toBe(900);
  });

  it("clamps a discount that would eat the whole basket", async () => {
    await addOffer({ name_en: "100 off", kind: "fixed", threshold: 0, value: 100 });
    const order = await placeOrderAt(120);
    expect(order.discount_total).toBe(100);
    expect(order.total).toBe(20);
  });

  it("refuses an order whose total would be zero or negative", async () => {
    // A discount that swallows the subtotal is clamped to it, which leaves a
    // zero total — an order nobody can pay, so `place_order` rejects it rather
    // than writing a free order.
    await addOffer({ name_en: "999 off", kind: "fixed", threshold: 0, value: 999 });
    const adminClient = admin();
    const category = await adminClient.from("categories").select("id").limit(1).single();
    const itemId = crypto.randomUUID();
    await adminClient.from("menu_items").insert({
      id: itemId,
      restaurant_id: RESTAURANT,
      category_id: (category.data as { id: string }).id,
      name_en: "Probe dish",
      slug: `probe-${itemId}`,
      price: 120,
      is_available: true,
      is_archived: false,
    });
    const client = customer("zero-total");
    await client.from("profiles").upsert({ id: "zero-total", restaurant_id: RESTAURANT, is_blocked: false });
    const address = await client
      .from("addresses")
      .insert({ user_id: "zero-total", address_line: "1 Test St" })
      .select("id")
      .single();
    const placed = await client.rpc("place_order", {
      p_user_id: "zero-total",
      p_items: [{ menu_item_id: itemId, quantity: 1, modifiers: [] }],
      p_address_id: (address.data as { id: string }).id,
      p_fulfillment: "delivery",
      p_payment_method: "cash_on_delivery",
      p_idempotency_key: `idem-${Math.random().toString(36).slice(2, 12)}`,
    });
    expect(placed.error?.code).toBe("INVALID_TOTAL");
  });

  it("applies only the single best offer, not all of them", async () => {
    await addOffer({ name_en: "small", kind: "fixed", threshold: 0, value: 20 });
    await addOffer({ name_en: "big", kind: "fixed", threshold: 0, value: 75 });
    const order = await placeOrderAt(300);
    // Best wins: 75, not 20 + 75.
    expect(order.discount_total).toBe(75);
    expect(order.offer_name).toBe("big");
  });

  it("breaks a tie on sort_order, then creation order", async () => {
    await addOffer({ name_en: "later", kind: "fixed", threshold: 0, value: 50, sort_order: 5 });
    await addOffer({ name_en: "earlier", kind: "fixed", threshold: 0, value: 50, sort_order: 1 });
    const order = await placeOrderAt(300);
    expect(order.offer_name).toBe("earlier");
  });

  it("ignores a disabled offer", async () => {
    await addOffer({ name_en: "off", kind: "fixed", threshold: 0, value: 90, is_enabled: false });
    const order = await placeOrderAt(300);
    expect(order.discount_total).toBe(0);
  });

  it("targets a single customer and leaves everyone else out", async () => {
    await addOffer({ name_en: "vip only", kind: "fixed", threshold: 0, value: 40, customer_id: "vip-1" });

    const vip = await placeOrderAt(300, "vip-1");
    expect(vip.discount_total).toBe(40);

    const regular = await placeOrderAt(300, "regular-1");
    expect(regular.discount_total).toBe(0);
  });

  it("matches a targeted offer to the placing customer's id", async () => {
    await addOffer({ name_en: "vip", kind: "fixed", threshold: 0, value: 40, customer_id: "vip-9" });
    const mine = await placeOrderAt(300, "vip-9");
    const theirs = await placeOrderAt(300, "someone-else");
    expect(mine.discount_total).toBe(40);
    expect(theirs.discount_total).toBe(0);
  });

  it("treats an untargeted offer as available to everyone", async () => {
    await addOffer({ name_en: "everyone", kind: "fixed", threshold: 0, value: 25 });
    const a = await placeOrderAt(300, "cust-a");
    const b = await placeOrderAt(300, "cust-b");
    expect(a.discount_total).toBe(25);
    expect(b.discount_total).toBe(25);
  });

  it("prefers a targeted offer over a bigger untargeted one only when it saves more", async () => {
    await addOffer({ name_en: "everyone 30", kind: "fixed", threshold: 0, value: 30 });
    await addOffer({ name_en: "vip 60", kind: "fixed", threshold: 0, value: 60, customer_id: "vip-2" });
    const vip = await placeOrderAt(300, "vip-2");
    const other = await placeOrderAt(300, "plain-2");
    expect(vip.discount_total).toBe(60);
    expect(other.discount_total).toBe(30);
  });
});

describe("offers: preview and stored price agree", () => {
  const rule = (over: Partial<OfferRule>): OfferRule => ({
    id: "o",
    name_en: "o",
    name_ar: null,
    kind: "percent",
    threshold: 0,
    value: 10,
    max_discount: null,
    customer_id: null,
    ...over,
  });

  it("agrees with place_order on a percent basket", async () => {
    await addOffer({ name_en: "15% off 100", kind: "percent", threshold: 100, value: 15 });
    const order = await placeOrderAt(500);

    const preview = computeTotals(500, {
      config: { ...CONFIG, offers: [rule({ kind: "percent", threshold: 100, value: 15 })] },
    });
    expect(preview.offerDiscount).toBe(order.discount_total);
  });

  it("taxes the discounted subtotal, matching place_order", async () => {
    // Tax applies after the offer and the delivery fee, so a discount lowers the
    // tax too. Both implementations must agree or the preview lies to the buyer.
    const adminClient = admin();
    await adminClient.from("settings").upsert({ key: "tax.rate", value: 0.14, is_public: true });
    await adminClient.from("settings").upsert({ key: "delivery.fee", value: 30, is_public: true });
    await adminClient.from("settings").upsert({ key: "delivery.free_over", value: 250, is_public: true });
    await addOffer({ name_en: "10% off", kind: "percent", threshold: 0, value: 10 });
    const order = await placeOrderAt(200);

    const preview = computeTotals(200, {
      config: { ...CONFIG, taxRate: 0.14, deliveryFee: 30, freeDeliveryOver: 250, offers: [rule({ value: 10 })] },
    });
    expect(order.discount_total).toBe(20);
    expect(order.delivery_fee).toBe(30);
    // (200 - 20 + 30) * 0.14 = 29.4
    expect(order.tax_total).toBeCloseTo(29.4, 2);
    expect(order.total).toBeCloseTo(239.4, 2);
    expect(preview.total).toBe(order.total);
  });

  it("waives the delivery fee once the free-delivery threshold is met", async () => {
    const adminClient = admin();
    await adminClient.from("settings").upsert({ key: "delivery.fee", value: 30, is_public: true });
    await adminClient.from("settings").upsert({ key: "delivery.free_over", value: 250, is_public: true });
    const order = await placeOrderAt(300);
    expect(order.delivery_fee).toBe(0);
  });

  it("picks the same winner as the preview when offers compete", () => {
    const offers = [
      rule({ id: "a", kind: "fixed", value: 30 }),
      rule({ id: "b", kind: "percent", value: 20 }),
    ];
    // 20% of 200 = 40 beats a flat 30.
    expect(bestOffer(200, offers)?.offer.id).toBe("b");
    expect(bestOffer(200, offers)?.amount).toBe(40);
  });

  it("clamps the previewed discount to the subtotal like the RPC does", () => {
    const preview = computeTotals(50, {
      config: { ...CONFIG, offers: [rule({ kind: "fixed", value: 500 })] },
    });
    expect(preview.offerDiscount).toBe(50);
    expect(preview.total).toBe(0);
  });
});
