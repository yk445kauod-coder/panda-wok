/**
 * The CRM read functions, ported to D1.
 *
 * `crm_customers` / `crm_stats` / `crm_customer_count` / `crm_estimate_segment`
 * were Postgres-only, so on the D1 backend the whole CRM page returned 500.
 * These run the ported functions against a real SQLite engine with the real
 * schema, so the SQL, the JSON shape and the aggregate rules are all exercised —
 * a mock would pass while the query was wrong.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1Client } from "@/lib/d1/client";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));
const actorPath = fileURLToPath(new URL("../migrations/0003_updated_by.sql", import.meta.url));
const triggersPath = fileURLToPath(new URL("../migrations/0002_triggers.sql", import.meta.url));

const RESTAURANT = "b54b2620-90c5-4295-b617-bc1389db3ee9";

let db: SqliteD1;

function admin() {
  setD1Context({ userId: null, restaurantId: RESTAURANT, elevated: true });
  return new D1Client({ elevated: true, userId: null });
}

/** A customer row; only the fields the CRM reads. */
async function addCustomer(
  client: D1Client,
  id: string,
  fields: { full_name?: string; phone?: string; email?: string; is_blocked?: boolean; marketing_opt_in?: boolean; created_at?: string } = {},
) {
  await client.from("profiles").upsert({
    id,
    full_name: fields.full_name ?? null,
    phone: fields.phone ?? null,
    email: fields.email ?? null,
    is_blocked: fields.is_blocked ?? false,
    marketing_opt_in: fields.marketing_opt_in ?? false,
    restaurant_id: RESTAURANT,
    ...(fields.created_at ? { created_at: fields.created_at } : {}),
  });
}

let orderSeq = 0;
async function addOrder(
  client: D1Client,
  userId: string,
  fields: { status: string; total: number; created_at: string; items?: string[] },
) {
  orderSeq += 1;
  const orderId = `order-${orderSeq}`;
  await client.from("orders").insert({
    id: orderId,
    order_number: `PW-2601-${String(orderSeq).padStart(4, "0")}`,
    idempotency_key: `key-${orderSeq}`,
    user_id: userId,
    status: fields.status,
    total: fields.total,
    created_at: fields.created_at,
    restaurant_id: RESTAURANT,
  });
  for (const name of fields.items ?? []) {
    await client.from("order_items").insert({
      order_id: orderId,
      name_snapshot: name,
      unit_price: 100,
      quantity: 1,
      line_total: 100,
    });
  }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** The shape `crm_customers` returns, as the CRM page reads it. */
type CrmRow = {
  user_id: string;
  full_name: string | null;
  order_count: number;
  lifetime_value: number;
  avg_order_value: number;
  days_since_last_order: number | null;
  points_balance: number;
  tier: string;
  favorite_items: string[];
  is_blocked: boolean;
  marketing_opt_in: boolean;
};

beforeAll(() => {
  db = createTestDatabase(
    [
      readFileSync(schemaPath, "utf8"),
      readFileSync(actorPath, "utf8"),
      readFileSync(triggersPath, "utf8"),
    ].join("\n"),
  );
  setD1Database(db);
});

beforeEach(async () => {
  db.exec('DELETE FROM "order_items"; DELETE FROM "orders"; DELETE FROM "profiles";');
  orderSeq = 0;
});

describe("d1 crm rpc", () => {
  it("crm_customers returns the book with the shape the page reads", async () => {
    const client = admin();
    await addCustomer(client, "c1", { full_name: "Nour Hassan", phone: "0100", email: "nour@example.com" });
    await addOrder(client, "c1", { status: "finished", total: 250, created_at: daysAgo(2), items: ["Chicken"] });
    await addOrder(client, "c1", { status: "finished", total: 150, created_at: daysAgo(1), items: ["Beef"] });

    const { data, error } = await client.rpc<CrmRow[]>("crm_customers", {
      p_limit: 50,
      p_offset: 0,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = data![0];
    expect(row.full_name).toBe("Nour Hassan");
    expect(row.order_count).toBe(2);
    expect(row.lifetime_value).toBe(400);
    expect(row.avg_order_value).toBe(200);
    expect(row.tier).toBe("bronze");
    expect(row.points_balance).toBe(0);
    expect([...row.favorite_items].sort()).toEqual(["Beef", "Chicken"]);
  });

  it("excludes canceled orders from the count and the lifetime value", async () => {
    const client = admin();
    await addCustomer(client, "c1");
    await addOrder(client, "c1", { status: "finished", total: 300, created_at: daysAgo(3) });
    await addOrder(client, "c1", { status: "canceled", total: 999, created_at: daysAgo(2) });

    const { data } = await client.rpc<CrmRow[]>("crm_customers", {});
    expect(data![0].order_count).toBe(1);
    expect(data![0].lifetime_value).toBe(300);
  });

  it("filters by name, phone or email and paginates", async () => {
    const client = admin();
    await addCustomer(client, "c1", { full_name: "Ali" });
    await addCustomer(client, "c2", { full_name: "Mona", phone: "0111222333" });
    await addCustomer(client, "c3", { full_name: "Sara", email: "sara@shop.com" });

    const byName = await client.rpc<CrmRow[]>("crm_customers", { p_search: "mon" });
    expect(byName.data).toHaveLength(1);
    expect(byName.data![0].user_id).toBe("c2");

    const byEmail = await client.rpc<CrmRow[]>("crm_customers", { p_search: "shop.com" });
    expect(byEmail.data![0].user_id).toBe("c3");

    const page = await client.rpc<CrmRow[]>("crm_customers", { p_limit: 1, p_offset: 0 });
    expect(page.data).toHaveLength(1);
  });

  it("crm_customer_count matches the filtered list", async () => {
    const client = admin();
    await addCustomer(client, "c1", { full_name: "Ali" });
    await addCustomer(client, "c2", { full_name: "Mona" });

    const all = await client.rpc<number>("crm_customer_count", {});
    expect(all.data).toBe(2);
    const filtered = await client.rpc<number>("crm_customer_count", { p_search: "ali" });
    expect(filtered.data).toBe(1);
  });

  it("crm_stats aggregates the whole book", async () => {
    const client = admin();
    await addCustomer(client, "c1", { marketing_opt_in: true });
    await addCustomer(client, "c2", { is_blocked: true });
    await addCustomer(client, "c3");
    // c1: three orders -> repeat, lifetime 600, active
    await addOrder(client, "c1", { status: "finished", total: 200, created_at: daysAgo(1) });
    await addOrder(client, "c1", { status: "finished", total: 200, created_at: daysAgo(2) });
    await addOrder(client, "c1", { status: "finished", total: 200, created_at: daysAgo(3) });
    // c2: one order 45 days ago -> at risk
    await addOrder(client, "c2", { status: "finished", total: 100, created_at: daysAgo(45) });

    const { data, error } = await client.rpc<Record<string, unknown>[]>("crm_stats", {});
    expect(error).toBeNull();
    const stats = data![0];
    expect(stats.customer_count).toBe(3);
    expect(stats.lifetime_value).toBe(700);
    expect(stats.repeat_customers).toBe(1);
    expect(stats.at_risk_customers).toBe(1);
    expect(stats.blocked_customers).toBe(1);
    expect(stats.marketing_opt_in).toBe(1);
  });

  it("crm_estimate_segment counts each segment", async () => {
    const client = admin();
    await addCustomer(client, "c1", { created_at: daysAgo(5) }); // new, never ordered
    await addCustomer(client, "c2", { created_at: daysAgo(200) });
    await addOrder(client, "c2", { status: "finished", total: 200, created_at: daysAgo(1) });
    await addOrder(client, "c2", { status: "finished", total: 200, created_at: daysAgo(2) });
    await addOrder(client, "c2", { status: "finished", total: 200, created_at: daysAgo(3) }); // loyal
    await addCustomer(client, "c3", { created_at: daysAgo(400) });
    await addOrder(client, "c3", { status: "finished", total: 900, created_at: daysAgo(60) }); // winback + high value + inactive

    const all = await client.rpc<number>("crm_estimate_segment", { p_segment: "all" });
    expect(all.data).toBe(3);
    const never = await client.rpc<number>("crm_estimate_segment", { p_segment: "never_ordered" });
    expect(never.data).toBe(1);
    const loyal = await client.rpc<number>("crm_estimate_segment", { p_segment: "loyal" });
    expect(loyal.data).toBe(1);
    const winback = await client.rpc<number>("crm_estimate_segment", { p_segment: "winback" });
    expect(winback.data).toBe(1);
    const high = await client.rpc<number>("crm_estimate_segment", { p_segment: "high_value", p_value: 700 });
    expect(high.data).toBe(1);
    const inactive = await client.rpc<number>("crm_estimate_segment", { p_segment: "inactive", p_value: 30 });
    expect(inactive.data).toBe(1);
    const unknown = await client.rpc<number>("crm_estimate_segment", { p_segment: "nonsense" });
    expect(unknown.data).toBe(0);
  });

  it("returns an empty book without error", async () => {
    const client = admin();
    const customers = await client.rpc<CrmRow[]>("crm_customers", {});
    expect(customers.error).toBeNull();
    expect(customers.data).toEqual([]);
    const stats = await client.rpc<Record<string, unknown>[]>("crm_stats", {});
    expect(stats.data![0].customer_count).toBe(0);
  });
});
