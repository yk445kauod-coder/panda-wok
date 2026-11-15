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
const seedPath = fileURLToPath(new URL("../scripts/seed/catalog-backup.json", import.meta.url));

let db: SqliteD1;

beforeAll(async () => {
  db = createTestDatabase(readFileSync(schemaPath, "utf8"));
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

describe("d1-compat: rpc", () => {
  it("place_order writes the order, its lines, the history row and a notification", async () => {
    setD1Context({ elevated: false, userId: "customer-1" });
    const client = new D1Client({ elevated: false, userId: "customer-1" });

    const { data, error } = await client.rpc("place_order", {
      p_user_id: "customer-1",
      p_items: [
        { menu_item_id: null, name_snapshot: "Combo", unit_price: 100, quantity: 2, modifiers: [] },
        { menu_item_id: null, name_snapshot: "Cola", unit_price: 25, quantity: 1, modifiers: [] },
      ],
      p_address: { area: "Smouha", address_line: "1 Test St" },
      p_fulfillment: "delivery",
      p_payment_method: "cash_on_delivery",
      p_idempotency_key: "idem-test-1",
    });

    expect(error).toBeNull();
    const order = data as { id: string; subtotal: number; total: number; status: string; order_number: string };
    expect(order.status).toBe("new");
    expect(order.subtotal).toBe(225);
    expect(order.total).toBeGreaterThan(0);
    expect(order.order_number).toMatch(/^PW-\d+$/);

    const lines = await client.from("order_items").select("id").eq("order_id", order.id);
    expect((lines.data as unknown[]).length).toBe(2);

    const history = await client
      .from("order_status_history")
      .select("to_status, from_status")
      .eq("order_id", order.id);
    const historyRows = history.data as Array<{ to_status: string; from_status: string | null }>;
    expect(historyRows.length).toBe(1);
    expect(historyRows[0].to_status).toBe("new");
    expect(historyRows[0].from_status).toBeNull();

    const notes = await client.from("notifications").select("id").eq("user_id", "customer-1");
    expect((notes.data as unknown[]).length).toBeGreaterThan(0);
  });

  it("place_order is idempotent for the same key", async () => {
    setD1Context({ elevated: false, userId: "customer-2" });
    const client = new D1Client({ elevated: false, userId: "customer-2" });
    const args = {
      p_user_id: "customer-2",
      p_items: [{ name_snapshot: "X", unit_price: 10, quantity: 1 }],
      p_fulfillment: "pickup",
      p_idempotency_key: "idem-test-2",
    };
    const first = await client.rpc("place_order", args);
    const second = await client.rpc("place_order", args);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect((first.data as { id: string }).id).toBe((second.data as { id: string }).id);
  });

  it("an unported rpc fails loudly rather than returning empty data", async () => {
    const client = new D1Client({ elevated: false, userId: null });
    const { data, error } = await client.rpc("definitely_not_ported");
    expect(data).toBeNull();
    expect(error?.message).toContain("not ported");
  });
});
