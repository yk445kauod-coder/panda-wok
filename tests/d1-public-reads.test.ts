/**
 * The customer storefront reads must come from D1, not Supabase.
 *
 * The bug this guards: `createPublicSupabase()` never branched on the backend, so
 * every public catalogue/settings/content read still went to the Supabase project
 * (402 `exceed_cached_egress_quota`). The storefront only stayed up on a stale KV
 * snapshot, so an admin menu edit never reached a customer. This asserts the
 * public reader is the D1 shim and that it returns the real menu.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Client } from "@/lib/d1/client";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { createD1PublicClient } from "@/lib/d1/public-client";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));
const seedPath = fileURLToPath(new URL("../scripts/seed/catalog-backup.json", import.meta.url));
const RESTAURANT = "b54b2620-90c5-4295-b617-bc1389db3ee9";

let db: SqliteD1;

beforeAll(async () => {
  process.env.DATA_BACKEND = "d1";
  db = createTestDatabase(readFileSync(schemaPath, "utf8"));
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
    menu.items.map(({ modifier_groups: _d, ...item }) => ({ ...item, restaurant_id: RESTAURANT })),
  );
});

describe("createPublicSupabase on the D1 backend", () => {
  it("returns the D1 shim, not a Supabase client", async () => {
    const { createPublicSupabase } = await import("@/lib/supabase/server");
    const client = createPublicSupabase();
    expect(client).toBeInstanceOf(D1Client);
  });

  it("serves the real menu from D1", async () => {
    const client = createD1PublicClient();
    const { data, error } = await client
      .from("menu_items")
      .select("id, name_en, price, is_archived")
      .eq("is_archived", false);

    expect(error).toBeNull();
    expect((data as unknown[]).length).toBeGreaterThan(0);
    const first = (data as Array<{ name_en: string; price: number }>)[0];
    expect(typeof first.name_en).toBe("string");
    expect(typeof first.price).toBe("number");
  });
});
