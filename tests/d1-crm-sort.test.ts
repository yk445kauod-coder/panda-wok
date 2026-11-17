/**
 * The CRM customer list is paged now, so its ordering moved server-side.
 *
 * The page used to sort the rows in the browser, which is only correct while
 * every row is on screen. Once the list is 25 rows per page, a client-side sort
 * would reorder just those 25 and read as if the whole book had been sorted.
 * `crm_customers` gained a `p_sort` argument for that reason, and this exercises
 * it against real SQLite so the SQL is checked, not only the shape.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { runRpc, type RpcContext } from "@/lib/d1/rpc";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));
const RESTAURANT = "b54b2620-90c5-4295-b617-bc1389db3ee9";

let db: SqliteD1;
const admin: RpcContext = { elevated: true, userId: "staff-1", restaurantId: RESTAURANT };

type Row = {
  user_id: string;
  order_count: number;
  lifetime_value: number;
  days_since_last_order: number | null;
};

beforeEach(() => {
  db = createTestDatabase(readFileSync(schemaPath, "utf8"));
  setD1Database(db);
  setD1Context({ userId: "staff-1", restaurantId: RESTAURANT, elevated: true });
});

async function seedCustomer(
  id: string,
  opts: { name: string; created: string },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO "profiles" ("id", "full_name", "created_at", "restaurant_id") VALUES (?1, ?2, ?3, ?4)',
    )
    .bind(id, opts.name, opts.created, RESTAURANT)
    .run();
}

async function seedOrder(
  id: string,
  userId: string,
  opts: { total: number; status: string; created: string },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO "orders" ("id", "order_number", "idempotency_key", "user_id", "total", "status", "created_at", "restaurant_id") ' +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(id, id, id, userId, opts.total, opts.status, opts.created, RESTAURANT)
    .run();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function list(sort: string): Promise<Row[]> {
  const { data, error } = await runRpc<Row[]>("crm_customers", { p_sort: sort, p_limit: 50 }, admin);
  expect(error).toBeNull();
  return data ?? [];
}

describe("crm_customers sorting", () => {
  beforeEach(async () => {
    // Big spender: one finished order, recent.
    await seedCustomer("big", { name: "Big Spender", created: daysAgo(10) });
    await seedOrder("o1", "big", { total: 1000, status: "finished", created: daysAgo(3) });
    // Frequent: three small finished orders, most recent.
    await seedCustomer("freq", { name: "Frequent", created: daysAgo(20) });
    for (let i = 0; i < 3; i += 1) {
      await seedOrder(`f${i}`, "freq", { total: 50, status: "finished", created: daysAgo(1) });
    }
    // Lapsed: one finished order long ago.
    await seedCustomer("lapsed", { name: "Lapsed", created: daysAgo(200) });
    await seedOrder("l1", "lapsed", { total: 200, status: "finished", created: daysAgo(120) });
  });

  it("orders by lifetime value descending", async () => {
    const rows = await list("lifetime_value");
    expect(rows.map((r) => r.user_id)).toEqual(["big", "lapsed", "freq"]);
  });

  it("orders by order count descending", async () => {
    const rows = await list("orders");
    expect(rows[0]!.user_id).toBe("freq");
  });

  it("orders the most-at-risk (longest since last order) first", async () => {
    const rows = await list("at_risk");
    expect(rows[0]!.user_id).toBe("lapsed");
  });

  it("defaults to most-recently-ordered first", async () => {
    const rows = await list("recent");
    expect(rows[0]!.user_id).toBe("freq");
  });

  it("falls back to recent for an unknown sort value", async () => {
    const rows = await list("'; drop table orders; --");
    expect(rows[0]!.user_id).toBe("freq");
  });
});
