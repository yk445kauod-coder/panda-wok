/**
 * The ops dashboard/analytics aggregates, on the D1 backend.
 *
 * `loadDashboardMetrics` folds real rows in the Worker. When it read through the
 * service-role client it bypassed the D1 shim and returned zeros on D1 — the
 * console showed an empty dashboard while the orders list showed real orders.
 * These run the real function against a real SQLite engine with the real schema,
 * so a wrong query or an unwired client fails here instead of in production.
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

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeAll(() => {
  process.env.DATA_BACKEND = "d1";
  db = createTestDatabase(
    [
      readFileSync(schemaPath, "utf8"),
      readFileSync(actorPath, "utf8"),
      readFileSync(triggersPath, "utf8"),
    ].join("\n"),
  );
  setD1Database(db);
});

beforeEach(() => {
  db.exec(
    'DELETE FROM "feedback"; DELETE FROM "order_items"; DELETE FROM "orders"; DELETE FROM "profiles";',
  );
});

describe("dashboard metrics on D1", () => {
  it("counts today's orders, window revenue and customers from real rows", async () => {
    const client = admin();

    await client.from("profiles").upsert([
      { id: "c1", full_name: "Nour", restaurant_id: RESTAURANT, created_at: daysAgo(1) },
      { id: "c2", full_name: "Ali", restaurant_id: RESTAURANT, created_at: daysAgo(40) },
    ]);

    await client.from("orders").insert([
      {
        id: "o1",
        order_number: "PW-1",
        idempotency_key: "k1",
        user_id: "c1",
        status: "finished",
        total: 300,
        payment_status: "paid",
        created_at: new Date().toISOString(),
        restaurant_id: RESTAURANT,
      },
      {
        id: "o2",
        order_number: "PW-2",
        idempotency_key: "k2",
        user_id: "c2",
        status: "finished",
        total: 200,
        payment_status: "paid",
        created_at: daysAgo(3),
        restaurant_id: RESTAURANT,
      },
    ]);

    await client.from("order_items").insert([
      { order_id: "o1", name_snapshot: "Chicken", unit_price: 300, quantity: 1, line_total: 300 },
      { order_id: "o2", name_snapshot: "Beef", unit_price: 200, quantity: 1, line_total: 200 },
    ]);

    const { getDashboardMetrics } = await import("@/lib/crm/insights");
    const metrics = await getDashboardMetrics(30);

    expect(metrics.ordersToday).toBe(1);
    expect(metrics.ordersInWindow).toBe(2);
    expect(metrics.revenueInWindow).toBe(500);
    expect(metrics.newCustomers).toBe(1);
    expect(metrics.topItems.map((i) => i.name).sort()).toEqual(["Beef", "Chicken"]);
    expect(metrics.statusBreakdown).toContainEqual({ status: "finished", count: 2 });
  });

  it("inserts append-only rows into INTEGER-primary-key tables", async () => {
    const client = admin();

    // These tables use a Postgres bigserial id; the shim must let SQLite assign
    // it rather than injecting a UUID, or the insert fails with "datatype
    // mismatch" and the row (an analytics event, an audit entry) is lost.
    const event = await client.from("analytics_events").insert({
      user_id: null,
      session_id: "s1",
      event: "PAGE_VIEW",
      path: "/en/menu",
      device: "mobile",
      referrer: null,
      metadata: { source: "test" },
    });
    expect(event.error).toBeNull();

    const audit = await client.from("audit_logs").insert({
      actor_id: "c1",
      actor_role: "owner",
      action: "order.accepted",
      entity: "orders",
      entity_id: "o1",
    });
    expect(audit.error).toBeNull();

    const count = await client
      .from("analytics_events")
      .select("id, event", { count: "exact" });
    expect(count.count).toBe(1);
    expect((count.data as Array<{ event: string }>)[0].event).toBe("PAGE_VIEW");
  });
});
