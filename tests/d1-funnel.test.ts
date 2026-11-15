/**
 * `funnel_counts(p_days)`, the D1 port of the analytics funnel.
 *
 * The Supabase path scanned `analytics_events` five times and deduped sessions
 * in the Worker; on D1 the table grows with every page view, so the counts are
 * computed in SQLite instead. This runs the handler against a real SQLite engine
 * so the DISTINCT-session dedup and the `days` window are actually exercised.
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

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();

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

beforeEach(() => {
  db.exec('DELETE FROM "analytics_events"; DELETE FROM "orders";');
});

let eventSeq = 0;
async function addEvent(client: D1Client, sessionId: string, event: string, daysAgo = 1) {
  eventSeq += 1;
  // `analytics_events.id` is an auto-assigned INTEGER, so it is not passed.
  void eventSeq;
  await client.from("analytics_events").upsert([
    {
      session_id: sessionId,
      event,
      created_at: iso(daysAgo),
    },
  ]);
}

let orderSeq = 0;
async function addOrder(client: D1Client, status: string, daysAgo = 1) {
  orderSeq += 1;
  await client.from("orders").upsert([
    {
      id: `ord-${orderSeq}`,
      order_number: 1000 + orderSeq,
      idempotency_key: `idem-${orderSeq}`,
      user_id: `user-${orderSeq}`,
      status,
      total: 100,
      restaurant_id: RESTAURANT,
      created_at: iso(daysAgo),
    },
  ]);
}

async function funnel(days: number) {
  const { data, error } = await admin().rpc("funnel_counts", { p_days: days });
  expect(error).toBeNull();
  return (Array.isArray(data) ? data[0] : data) as Record<string, number>;
}

describe("funnel_counts", () => {
  it("counts distinct sessions per stage, not raw events", async () => {
    const client = admin();
    // One session viewing twice must count once.
    await addEvent(client, "s1", "PAGE_VIEW");
    await addEvent(client, "s1", "MENU_VIEW");
    await addEvent(client, "s2", "ITEM_VIEW");
    await addEvent(client, "s2", "ITEM_VIEW");
    await addEvent(client, "s3", "CART_ADD");
    await addEvent(client, "s4", "CHECKOUT_STARTED");

    const row = await funnel(30);
    expect(row.visitors).toBe(1); // s1 (PAGE_VIEW ∪ MENU_VIEW), deduped
    expect(row.menu_viewers).toBe(1);
    expect(row.item_viewers).toBe(1); // two events, one session
    expect(row.cart_users).toBe(1);
    expect(row.checkout_users).toBe(1);
  });

  it("counts visitors as the union of PAGE_VIEW and MENU_VIEW", async () => {
    const client = admin();
    await addEvent(client, "a", "PAGE_VIEW");
    await addEvent(client, "b", "MENU_VIEW");
    await addEvent(client, "c", "ITEM_VIEW"); // not a visitor stage

    const row = await funnel(30);
    expect(row.visitors).toBe(2);
    expect(row.menu_viewers).toBe(1);
  });

  it("respects the days window", async () => {
    const client = admin();
    await addEvent(client, "recent", "PAGE_VIEW", 5);
    await addEvent(client, "old", "PAGE_VIEW", 40);

    expect((await funnel(30)).visitors).toBe(1);
    expect((await funnel(60)).visitors).toBe(2);
  });

  it("counts customers as non-cancelled orders in the window", async () => {
    const client = admin();
    await addOrder(client, "finished");
    await addOrder(client, "canceled");
    await addOrder(client, "rejected");
    await addOrder(client, "failed");
    await addOrder(client, "finished", 40); // outside the window

    expect((await funnel(30)).customers).toBe(1);
  });

  it("returns zeros on an empty table", async () => {
    const row = await funnel(30);
    expect(row).toMatchObject({
      visitors: 0,
      menu_viewers: 0,
      item_viewers: 0,
      cart_users: 0,
      checkout_users: 0,
      customers: 0,
    });
  });
});
