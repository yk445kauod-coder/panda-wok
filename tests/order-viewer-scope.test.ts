/**
 * A customer must not be able to read another customer's order.
 *
 * The D1 backend has no row-level security, so the ownership predicate has to
 * live in the query. `getOrderForViewer` filtered on the row id alone, which
 * meant any signed-in customer could read any order — including the other
 * customer's delivery name, phone and address — by supplying its id. This test
 * runs the real reader against a real SQLite database with two customers.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { D1Client } from "@/lib/d1/client";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const RESTAURANT = "b54b2620-90c5-4295-b617-bc1389db3ee9";
const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const ALICE_ORDER = "aaaaaaaa-0000-0000-0000-000000000001";

let db: SqliteD1;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => new D1Client({ elevated: false, userId: null }),
}));

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));

beforeAll(async () => {
  process.env.DATA_BACKEND = "d1";
  db = createTestDatabase(readFileSync(schemaPath, "utf8"));
  setD1Database(db);
  setD1Context({ userId: null, restaurantId: RESTAURANT, elevated: true });

  const admin = new D1Client({ elevated: true, userId: null });
  await admin.from("restaurants").upsert([{ id: RESTAURANT, slug: "panda-wok", name_en: "Panda Wok" }]);
  await admin.from("orders").insert([
    {
      id: ALICE_ORDER,
      order_number: "PW-A",
      idempotency_key: "key-alice-0001",
      user_id: ALICE,
      status: "new",
      total: 100,
      restaurant_id: RESTAURANT,
    },
    {
      id: "bbbbbbbb-0000-0000-0000-000000000002",
      order_number: "PW-B",
      idempotency_key: "key-bob-0002",
      user_id: BOB,
      status: "new",
      total: 200,
      restaurant_id: RESTAURANT,
    },
  ]);
});

describe("getOrderForViewer ownership", () => {
  it("returns the order to its owner", async () => {
    const { getOrderForViewer } = await import("@/lib/services/orders");
    const order = await getOrderForViewer(ALICE_ORDER, ALICE);
    expect(order?.id).toBe(ALICE_ORDER);
    // The owner gets the full record, not a stripped-down one.
    expect(order?.order_number).toBe("PW-A");
  });

  it("returns null when another customer asks for it", async () => {
    const { getOrderForViewer } = await import("@/lib/services/orders");
    const order = await getOrderForViewer(ALICE_ORDER, BOB);
    expect(order).toBeNull();
  });

  it("returns null for an unknown order id", async () => {
    const { getOrderForViewer } = await import("@/lib/services/orders");
    const order = await getOrderForViewer("cccccccc-0000-0000-0000-000000000003", ALICE);
    expect(order).toBeNull();
  });

  it("does not leak the owner's items or history to another customer", async () => {
    const admin = new D1Client({ elevated: true, userId: null });
    await admin.from("order_items").insert([
      {
        id: "dddddddd-0000-0000-0000-000000000004",
        order_id: ALICE_ORDER,
        name_snapshot: "Sweet & Sour Chicken Box",
        quantity: 1,
        unit_price: 100,
        line_total: 100,
        restaurant_id: RESTAURANT,
      },
    ]);
    const { getOrderForViewer } = await import("@/lib/services/orders");
    const order = await getOrderForViewer(ALICE_ORDER, BOB);
    expect(order).toBeNull();
  });
});
