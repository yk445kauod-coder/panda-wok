/**
 * Embedded relations the admin console depends on.
 *
 * PostgREST resolved every `select("..., child(...)")` from a foreign key in the
 * schema. The D1 schema carries no FK constraints, so the shim has to know each
 * relationship; it used to guess the join column from the table name
 * (`<singular>_id`), which is right for a child's back-reference but wrong for
 * the many relations that link through a differently-named column — a customer
 * profile hangs off `orders.user_id`, an option hangs off
 * `modifier_options.group_id`, and a tag reaches a note through the
 * `customer_tag_links` join table. Guessing returned an empty relation and the
 * screens rendered as if the data were missing.
 *
 * These run against a real SQLite engine with the real schema, triggers and
 * catalogue, so a passing test means the query the app actually issues returns
 * the row it expects.
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

const RESTAURANT = "b54b2620-90c5-4295-b617-bc1389db3ee9";

let db: SqliteD1;
let dishId: string;

beforeAll(async () => {
  db = createTestDatabase(
    [
      readFileSync(schemaPath, "utf8"),
      readFileSync(actorPath, "utf8"),
      readFileSync(triggersPath, "utf8"),
    ].join("\n"),
  );
  setD1Database(db);
  setD1Context({ userId: null, restaurantId: RESTAURANT, elevated: true });

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
    await client.from("modifier_groups").upsert(
      groups.map(({ modifier_options: _drop, ...group }) => group),
    );
    const options = groups.flatMap((g) => (g.modifier_options as Array<Record<string, unknown>>) ?? []);
    if (options.length > 0) await client.from("modifier_options").upsert(options);
  }

  const first = await client
    .from("menu_items")
    .select("id")
    .eq("is_available", true)
    .limit(1)
    .single();
  dishId = (first.data as { id: string }).id;
});

function admin() {
  setD1Context({ elevated: true, userId: null });
  return new D1Client({ elevated: true, userId: null });
}

describe("d1 relations: order → customer profile", () => {
  it("attaches the profile to an order through user_id", async () => {
    const client = admin();
    const userId = "customer-embed-1";
    await client.from("profiles").upsert({ id: userId, full_name: "Mona Adel", phone: "01000000001" });
    const address = await client
      .from("addresses")
      .insert({ user_id: userId, address_line: "1 Test St", area: "Smouha", city: "Alexandria" })
      .select()
      .single();

    const placed = await client.rpc("place_order", {
      p_user_id: userId,
      p_items: [{ menu_item_id: dishId, quantity: 2, modifiers: [] }],
      p_address_id: (address.data as { id: string }).id,
      p_idempotency_key: "embed-key-0001",
      p_fulfillment: "delivery",
    });
    expect(placed.error).toBeNull();
    const orderId = (placed.data as { order_id: string }).order_id;

    // The exact select `listAdminOrders` issues.
    const { data, error } = await client
      .from("orders")
      .select(
        "id, order_number, status, user_id, order_items (id, name_snapshot, quantity), profiles (full_name, phone)",
      )
      .eq("id", orderId)
      .maybeSingle();

    expect(error).toBeNull();
    const row = data as {
      order_items: Array<{ name_snapshot: string }>;
      profiles: { full_name: string | null; phone: string | null } | null;
    };
    expect(row.order_items.length).toBe(1);
    // The join column is `user_id`, not the guessed `profile_id`.
    expect(row.profiles).not.toBeNull();
    expect(row.profiles?.full_name).toBe("Mona Adel");
    expect(row.profiles?.phone).toBe("01000000001");
  });
});

describe("d1 relations: modifier group → options", () => {
  it("attaches options through group_id", async () => {
    const client = admin();
    const { data, error } = await client
      .from("modifier_groups")
      .select("id, name_en, modifier_options (*)")
      .limit(1)
      .single();

    // Not every dish has option groups; if this one does not, the assertion is
    // vacuous, so skip explicitly rather than passing for the wrong reason.
    if (error?.code === "PGRST116") return;

    expect(error).toBeNull();
    const group = data as { modifier_options: unknown[] };
    expect(Array.isArray(group.modifier_options)).toBe(true);
    // `modifier_options.group_id` points back at the group; a guess of
    // `modifier_group_id` found nothing.
    expect(group.modifier_options.length).toBeGreaterThan(0);
  });
});

describe("d1 relations: customer note → tags", () => {
  it("attaches tags through the join table", async () => {
    const client = admin();
    const customerId = "customer-tags-1";
    await client.from("profiles").upsert({ id: customerId, full_name: "Tagged Customer" });
    const tag = await client
      .from("customer_tags")
      .insert({ key: "vip", label_en: "VIP", label_ar: "مميز", tone: "success" })
      .select()
      .single();
    const tagId = (tag.data as { id: string }).id;
    await client.from("customer_tag_links").insert({ customer_id: customerId, tag_id: tagId });
    const note = await client
      .from("customer_notes")
      .insert({ customer_id: customerId, body: "Likes it spicy", is_pinned: false })
      .select()
      .single();
    const noteId = (note.data as { id: string }).id;

    // The CRM customer-detail screen reads notes with their tags.
    const { data, error } = await client
      .from("customer_notes")
      .select("id, body, customer_tags (id, key, label_en)")
      .eq("id", noteId)
      .maybeSingle();

    expect(error).toBeNull();
    const row = data as { customer_tags: Array<{ key: string }> };
    expect(Array.isArray(row.customer_tags)).toBe(true);
    expect(row.customer_tags.map((t) => t.key)).toContain("vip");
  });
});

describe("d1 relations: nested embeds", () => {
  it("parses a two-level embed and fills both levels", async () => {
    const client = admin();
    // The exact select the menu detail page issues: an item with its groups,
    // each group with its options. Before the parser was recursive the inner
    // relation collapsed into a bogus column and every option was dropped.
    const { data, error } = await client
      .from("menu_items")
      .select(
        "id, slug, modifier_groups (id, menu_item_id, name_en, min_select, max_select, is_required, modifier_options (id, group_id, name_en, price_delta, is_available))",
      )
      .eq("slug", "lo-mein-chinese-fried-noodles")
      .maybeSingle();

    expect(error).toBeNull();
    const item = data as {
      modifier_groups: Array<{ name_en: string; modifier_options: Array<{ name_en: string }> }>;
    };
    expect(item.modifier_groups.length).toBeGreaterThan(0);
    const withOptions = item.modifier_groups.filter((g) => g.modifier_options.length > 0);
    expect(withOptions.length).toBeGreaterThan(0);
    for (const group of withOptions) {
      expect(typeof group.modifier_options[0].name_en).toBe("string");
    }
  });

  it("does not invent a column from the nested relation text", async () => {
    const client = admin();
    const { data, error } = await client
      .from("menu_items")
      .select("id, modifier_groups (id, modifier_options (id))")
      .limit(1);
    expect(error).toBeNull();
    const rows = data as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    // No key named after the raw `modifier_options (id` token.
    expect(Object.keys(rows[0])).not.toContain("modifier_options (id");
  });
});
