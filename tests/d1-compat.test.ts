/**
 * End-to-end tests for the D1 compatibility layer.
 *
 * These run the shim against a real SQLite engine with the real schema and the
 * real catalogue loaded, so they check the thing that actually matters: that a
 * query written for supabase-js returns the rows and shapes the app expects.
 * A mock would pass while the SQL was wrong.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Client } from "@/lib/d1/client";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));
const triggersPath = fileURLToPath(new URL("../migrations/0002_triggers.sql", import.meta.url));
const actorPath = fileURLToPath(new URL("../migrations/0003_updated_by.sql", import.meta.url));
const seedPath = fileURLToPath(new URL("../scripts/seed/catalog-backup.json", import.meta.url));

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
  setD1Context({ userId: null, restaurantId: "b54b2620-90c5-4295-b617-bc1389db3ee9", elevated: false });

  // Load the real menu through the same upserts the loader emits.
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as Record<string, { value: unknown }>;
  const menu = seed["public-menu"].value as {
    categories: Array<Record<string, unknown>>;
    items: Array<Record<string, unknown>>;
  };
  const restaurantId = "b54b2620-90c5-4295-b617-bc1389db3ee9";
  const client = new D1Client({ elevated: true, userId: null });

  await client.from("restaurants").upsert([{ id: restaurantId, slug: "panda-wok", name_en: "Panda Wok" }]);
  await client.from("categories").upsert(
    menu.categories.map((c) => ({ ...c, restaurant_id: restaurantId })),
  );
  // `modifier_groups` is an embedded relation, not a column: strip it and write
  // the groups and options to their own tables, as the loader does.
  await client.from("menu_items").upsert(
    menu.items.map(({ modifier_groups: _drop, ...item }) => ({ ...item, restaurant_id: restaurantId })),
  );
  const groups = menu.items.flatMap((i) => (i.modifier_groups as Array<Record<string, unknown>>) ?? []);
  if (groups.length > 0) {
    await client.from("modifier_groups").upsert(
      groups.map(({ modifier_options: _drop, ...group }) => group),
    );
    const options = groups.flatMap((g) => (g.modifier_options as Array<Record<string, unknown>>) ?? []);
    if (options.length > 0) await client.from("modifier_options").upsert(options);
  }
});

function publicClient() {
  setD1Context({ userId: null, elevated: false });
  return new D1Client({ elevated: false, userId: null });
}

describe("d1-compat: reads", () => {
  it("returns every category, ordered, with no error", async () => {
    const { data, error } = await publicClient()
      .from("categories")
      .select("id, name_en, slug, sort_order")
      .order("sort_order", { ascending: true });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBeGreaterThan(0);
    const rows = data as Array<{ sort_order: number }>;
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    expect(rows.map((r) => r.sort_order)).toEqual(sorted.map((r) => r.sort_order));
  });

  it("filters booleans as the app writes them (true, not 1)", async () => {
    // `.eq("is_archived", false)` has to match a stored 0. This is the exact
    // mismatch the coercion layer exists to prevent.
    const { data, error } = await publicClient()
      .from("menu_items")
      .select("id, name_en, price, is_archived")
      .eq("is_archived", false);

    expect(error).toBeNull();
    const rows = data as Array<{ is_archived: unknown }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.is_archived).toBe(false);
  });

  it("returns a price as a number with its real value", async () => {
    const { data } = await publicClient()
      .from("menu_items")
      .select("name_en, price")
      .order("price", { ascending: false })
      .limit(1);
    const [top] = data as Array<{ name_en: string; price: number }>;
    expect(typeof top.price).toBe("number");
    expect(top.price).toBe(1560);
  });

  it("maybeSingle returns null instead of throwing on no rows", async () => {
    const { data, error } = await publicClient()
      .from("menu_items")
      .select("id")
      .eq("slug", "no-such-dish-anywhere")
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("single reports PGRST116 when there is no row", async () => {
    const { data, error } = await publicClient()
      .from("menu_items")
      .select("id")
      .eq("slug", "no-such-dish-anywhere")
      .single();
    expect(data).toBeNull();
    expect(error?.code).toBe("PGRST116");
  });

  it("counts without returning rows", async () => {
    const { count, data } = await publicClient()
      .from("menu_items")
      .select("id", { count: "exact", head: true });
    expect(data).toBeNull();
    expect(count).toBeGreaterThan(80);
  });

  it("in() matches a set of slugs", async () => {
    const { data } = await publicClient()
      .from("menu_items")
      .select("slug")
      .in("slug", ["cola", "no-such-slug"]);
    const rows = data as Array<{ slug: string }>;
    expect(rows.every((r) => r.slug === "cola")).toBe(true);
  });

  it("ilike folds case", async () => {
    const { data } = await publicClient()
      .from("menu_items")
      .select("name_en")
      .ilike("name_en", "%combo%");
    expect((data as unknown[]).length).toBeGreaterThan(0);
  });

  it("parses an embedded select and attaches the relation", async () => {
    // `select("*, categories (id, name_en, slug)")` — a belongs-to embed.
    const { data, error } = await publicClient()
      .from("menu_items")
      .select("id, name_en, categories (id, name_en, slug)")
      .limit(3);

    expect(error).toBeNull();
    const rows = data as Array<{ categories: { name_en: string } | null }>;
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.categories).toBeTruthy();
      expect(typeof row.categories?.name_en).toBe("string");
    }
  });
});

describe("d1-compat: writes", () => {
  it("inserts, reads back, updates and deletes", async () => {
    setD1Context({ elevated: true, userId: "u1" });
    const client = new D1Client({ elevated: true, userId: "u1" });

    const inserted = await client
      .from("addresses")
      .insert({ user_id: "u1", label: "Home", address_line: "1 Test St", is_default: true })
      .select()
      .single();
    expect(inserted.error).toBeNull();
    const address = inserted.data as { id: string; is_default: unknown };
    expect(address.id).toBeTruthy();
    // A boolean written as `true` reads back as `true`, not `1`.
    expect(address.is_default).toBe(true);

    const updated = await client
      .from("addresses")
      .update({ label: "Work" })
      .eq("id", address.id)
      .select()
      .single();
    expect((updated.data as { label: string }).label).toBe("Work");

    const deleted = await client.from("addresses").delete().eq("id", address.id);
    expect(deleted.error).toBeNull();
    const gone = await client.from("addresses").select("id").eq("id", address.id).maybeSingle();
    expect(gone.data).toBeNull();
  });

  it("upsert is idempotent on the conflict target", async () => {
    const client = new D1Client({ elevated: true, userId: null });
    const first = await client.from("settings").upsert({ key: "test.key", value: { a: 1 }, is_public: true });
    expect(first.error).toBeNull();
    const second = await client.from("settings").upsert({ key: "test.key", value: { a: 2 }, is_public: true });
    expect(second.error).toBeNull();

    const { data } = await client.from("settings").select("value").eq("key", "test.key").single();
    // jsonb round-trips as an object, not a string.
    expect(data).toEqual({ value: { a: 2 } });
  });
});

/**
 * Place a real order through the ported RPC. Every price is read from
 * `menu_items`, so the test uses real dish ids from the catalogue.
 */
async function placeOrder(
  client: D1Client,
  userId: string,
  key: string,
  overrides: Record<string, unknown> = {},
) {
  await client.from("profiles").upsert({ id: userId, is_blocked: false });
  const address = await client
    .from("addresses")
    .insert({
      user_id: userId,
      label: "Home",
      contact_name: "Test",
      contact_phone: "01000000000",
      address_line: "1 Test St",
      area: "Smouha",
      city: "Alexandria",
    })
    .select()
    .single();
  const addressId = (address.data as { id: string }).id;

  const menu = await client.from("menu_items").select("id, price").eq("is_available", true).limit(2);
  const dishes = menu.data as Array<{ id: string; price: number }>;

  return client.rpc("place_order", {
    p_user_id: userId,
    p_items: dishes.map((d) => ({ menu_item_id: d.id, quantity: 2, modifiers: [] })),
    p_address_id: addressId,
    p_fulfillment: "delivery",
    p_payment_method: "cash_on_delivery",
    p_idempotency_key: key,
    ...overrides,
  });
}

describe("d1-compat: rpc", () => {
  it("place_order prices from the database, not from the request", async () => {
    setD1Context({ elevated: false, userId: "customer-1" });
    const client = new D1Client({ elevated: false, userId: "customer-1" });

    const { data, error } = await placeOrder(client, "customer-1", "idem-test-0001");
    expect(error).toBeNull();
    const placed = data as { order_id: string; order_number: string; total: number; reused: boolean };
    expect(placed.reused).toBe(false);
    expect(placed.order_number).toMatch(/^PW-\d{4}-\d{4}$/);

    // The total has to be built from the stored prices, so recompute it and
    // check the order agrees.
    const lines = await client
      .from("order_items")
      .select("unit_price, quantity, line_total")
      .eq("order_id", placed.order_id);
    const rows = lines.data as Array<{ unit_price: number; quantity: number; line_total: number }>;
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.line_total).toBeCloseTo(row.unit_price * row.quantity, 2);
    }
    const subtotal = rows.reduce((sum, r) => sum + r.line_total, 0);
    const order = await client
      .from("orders")
      .select("subtotal, tax_total, delivery_fee, discount_total, total")
      .eq("id", placed.order_id)
      .single();
    const stored = order.data as Record<string, number>;
    expect(stored.subtotal).toBeCloseTo(subtotal, 2);
    // total = subtotal - discount + delivery + tax
    expect(stored.total).toBeCloseTo(
      stored.subtotal - stored.discount_total + stored.delivery_fee + stored.tax_total,
      2,
    );
  });

  it("place_order refuses a line the menu does not have", async () => {
    setD1Context({ elevated: false, userId: "customer-bad" });
    const client = new D1Client({ elevated: false, userId: "customer-bad" });
    await client.from("profiles").upsert({ id: "customer-bad", is_blocked: false });
    const address = await client
      .from("addresses")
      .insert({ user_id: "customer-bad", address_line: "1 Test St" })
      .select()
      .single();

    const { error } = await client.rpc("place_order", {
      p_user_id: "customer-bad",
      p_items: [{ menu_item_id: "00000000-0000-4000-8000-000000000000", quantity: 1 }],
      p_address_id: (address.data as { id: string }).id,
      p_idempotency_key: "idem-test-0002",
    });
    expect(error?.code).toBe("ITEM_NOT_FOUND");
  });

  it("place_order refuses a blocked account", async () => {
    setD1Context({ elevated: false, userId: "customer-blocked" });
    const client = new D1Client({ elevated: false, userId: "customer-blocked" });
    await client.from("profiles").upsert({ id: "customer-blocked", is_blocked: true });
    const { error } = await client.rpc("place_order", {
      p_user_id: "customer-blocked",
      p_items: [{ menu_item_id: "00000000-0000-4000-8000-000000000000", quantity: 1 }],
      p_address_id: "00000000-0000-4000-8000-000000000001",
      p_idempotency_key: "idem-test-0003",
    });
    expect(error?.code).toBe("ACCOUNT_BLOCKED");
  });

  it("place_order is idempotent for the same key", async () => {
    setD1Context({ elevated: false, userId: "customer-2" });
    const client = new D1Client({ elevated: false, userId: "customer-2" });
    const first = await placeOrder(client, "customer-2", "idem-test-0004");
    const second = await placeOrder(client, "customer-2", "idem-test-0004");
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect((first.data as { order_id: string }).order_id).toBe(
      (second.data as { order_id: string }).order_id,
    );
    expect((second.data as { reused: boolean }).reused).toBe(true);
  });

  it("an unported rpc fails loudly rather than returning empty data", async () => {
    const client = new D1Client({ elevated: false, userId: null });
    const { data, error } = await client.rpc("definitely_not_ported");
    expect(data).toBeNull();
    expect(error?.message).toContain("not ported");
  });
});

describe("d1-compat: triggers", () => {
  it("a status change writes the history row and stamps the time", async () => {
    setD1Context({ elevated: true, userId: "staff-1" });
    const client = new D1Client({ elevated: true, userId: "staff-1" });

    const placed = await placeOrder(client, "customer-3", "idem-trigger-0001");
    const orderId = (placed.data as { order_id: string }).order_id;

    const updated = await client.from("orders").update({ status: "accepted" }).eq("id", orderId);
    // Assert the write applied: a swallowed trigger error would otherwise make
    // this test pass while the timeline silently stopped updating.
    expect(updated.error).toBeNull();

    const history = await client
      .from("order_status_history")
      .select("from_status, to_status")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    const rows = history.data as Array<{ from_status: string | null; to_status: string }>;
    expect(rows.map((r) => r.to_status)).toEqual(["new", "accepted"]);
    expect(rows[1].from_status).toBe("new");

    const order = await client.from("orders").select("accepted_at").eq("id", orderId).single();
    expect((order.data as { accepted_at: string | null }).accepted_at).toBeTruthy();
  });

  it("a new order writes an activity log entry", async () => {
    setD1Context({ elevated: true, userId: null });
    const client = new D1Client({ elevated: true, userId: null });
    const placed = await placeOrder(client, "customer-5", "idem-trigger-0002");
    const logs = await client
      .from("activity_logs")
      .select("event")
      .eq("entity_id", (placed.data as { order_id: string }).order_id);
    expect((logs.data as Array<{ event: string }>)[0]?.event).toBe("ORDER_CREATED");
  });

  it("a customer message bumps the conversation counters", async () => {
    setD1Context({ elevated: true, userId: null });
    const client = new D1Client({ elevated: true, userId: null });
    const conversation = await client
      .from("conversations")
      .insert({ user_id: "customer-6", status: "closed", staff_unread: 0, customer_unread: 0 })
      .select()
      .single();
    const conversationId = (conversation.data as { id: string }).id;

    await client.from("messages").insert({
      conversation_id: conversationId,
      sender_id: "customer-6",
      sender_kind: "customer",
      body: "Hello?",
    });

    const after = await client
      .from("conversations")
      .select("status, staff_unread")
      .eq("id", conversationId)
      .single();
    const row = after.data as { status: string; staff_unread: number };
    // A customer replying to a closed thread reopens it and bumps the unread.
    expect(row.status).toBe("open");
    expect(row.staff_unread).toBe(1);
  });
});
