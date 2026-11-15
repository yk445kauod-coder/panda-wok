/**
 * The manual close lever must write, and both readers must agree.
 *
 * Two defects met here. The stored value can be the legacy text `"0.0"`, which
 * the storefront read as **open** (`!== false`) while the order gate read it as
 * **closed** (`Boolean(0)`) — the console could show "open" and the kitchen
 * still refuse every order. And a lever flip must actually change the row, so
 * this pins the write as well as the read.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { D1Client } from "@/lib/d1/client";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { storeIsOpen } from "@/lib/d1/rpc";
import { settingBoolean } from "@/lib/utils/settings-value";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));

let db: SqliteD1;

beforeEach(() => {
  db = createTestDatabase(readFileSync(schemaPath, "utf8"));
  setD1Database(db);
  setD1Context({ userId: null, restaurantId: "b54b2620-90c5-4295-b617-bc1389db3ee9", elevated: true });
});

async function put(key: string, raw: string): Promise<void> {
  await db
    .prepare('INSERT INTO "settings" ("key", "value", "is_public") VALUES (?1, ?2, 1)')
    .bind(key, raw)
    .run();
}

async function read(key: string): Promise<string> {
  const row = await db.prepare('SELECT "value" FROM "settings" WHERE "key" = ?1').bind(key).first<{ value: string }>();
  return row?.value ?? "<missing>";
}

describe("settingBoolean — one parser for every reader", () => {
  it("reads the legacy '0.0' as closed, not open", () => {
    expect(settingBoolean("0.0", true)).toBe(false);
    expect(settingBoolean("0", true)).toBe(false);
    expect(settingBoolean("false", true)).toBe(false);
    expect(settingBoolean("1", false)).toBe(true);
    expect(settingBoolean("true", false)).toBe(true);
    expect(settingBoolean(true, false)).toBe(true);
    expect(settingBoolean(false, true)).toBe(false);
    expect(settingBoolean(0, true)).toBe(false);
  });

  it("falls back only for an absent value", () => {
    expect(settingBoolean(undefined, true)).toBe(true);
    expect(settingBoolean(null, false)).toBe(false);
    expect(settingBoolean("", true)).toBe(true);
  });
});

describe("the close lever write", () => {
  it("flips the stored row and the gate follows", async () => {
    await put("ordering.accepting_orders", "0.0");
    const client = new D1Client({ elevated: true, userId: null });

    // Open it: the action writes a JSON boolean, so the column holds `true`.
    await client.from("settings").update({ value: true as never }).eq("key", "ordering.accepting_orders");
    expect(await read("ordering.accepting_orders")).toBe("true");
    expect(await storeIsOpen(new Date("2026-11-15T12:00:00Z"))).toBe(true);

    // Close it: the gate must now refuse.
    await client.from("settings").update({ value: false as never }).eq("key", "ordering.accepting_orders");
    expect(await read("ordering.accepting_orders")).toBe("false");
    expect(await storeIsOpen(new Date("2026-11-15T12:00:00Z"))).toBe(false);
  });

  it("both readers agree on the legacy '0.0' row", async () => {
    await put("ordering.accepting_orders", "0.0");
    // The gate reads closed...
    expect(await storeIsOpen(new Date("2026-11-15T12:00:00Z"))).toBe(false);
    // ...and the shared parser the storefront uses now agrees.
    expect(settingBoolean("0.0", true)).toBe(false);
  });
});
