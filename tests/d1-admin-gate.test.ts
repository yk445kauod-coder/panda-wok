/**
 * The console gate, run on the D1 backend.
 *
 * The gate is the only thing standing between the public and the ops console, and
 * its staff path matches a submitted secret against `staff.login_id` with a
 * case-insensitive `LIKE`.
 *
 * `escapeLike` backslash-escapes `%`, `_` and `*` in the submitted secret, but
 * SQLite's `LIKE` has no default escape character — so without an `ESCAPE`
 * clause the backslash is a literal character. The effect is measured below and
 * is a lockout, not a bypass: a worker whose `login_id` contains `_`, `%` or `*`
 * could never sign in, because the query looked for the backslash too. The
 * wildcard cases are asserted as well, so a future change that drops the escape
 * cannot quietly turn this into an open door.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.hoisted(() => {
  process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";
  process.env.DATA_BACKEND = "d1";
  process.env.ADMIN_PASSCODE = "Panda2026";
  return new Map<string, string>();
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookies.has(name) ? { name, value: cookies.get(name) } : undefined),
    set: (name: string, value: string) => void cookies.set(name, value),
    delete: (name: string) => void cookies.delete(name),
    getAll: () => [...cookies.entries()].map(([name, value]) => ({ name, value })),
  }),
  headers: async () => new Headers(),
}));

import { gateIdentity, grantUnlock, resolveSecret } from "@/lib/auth/admin-gate";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));

let db: SqliteD1;

beforeAll(() => {
  db = createTestDatabase(readFileSync(schemaPath, "utf8"));
  setD1Database(db);
  setD1Context({ userId: null, restaurantId: "b54b2620-90c5-4295-b617-bc1389db3ee9", elevated: true });
});

beforeEach(async () => {
  cookies.clear();
  db.exec('DELETE FROM "staff";');
  await db
    .prepare('INSERT INTO "staff" ("user_id", "role", "display_name", "is_active", "login_id") VALUES (?1, ?2, ?3, 1, ?4)')
    .bind("staff-1", "kitchen", "Line Cook", "kitchen_1")
    .run();
});

describe("resolveSecret on D1", () => {
  it("accepts the shared passcode as the owner", async () => {
    const identity = await resolveSecret("Panda2026");
    expect(identity).toEqual({ kind: "owner" });
  });

  it("accepts a staff login id case-insensitively", async () => {
    const identity = await resolveSecret("KITCHEN_1");
    expect(identity).toMatchObject({ kind: "staff", userId: "staff-1", role: "kitchen" });
  });

  it("refuses a wildcard secret instead of matching the first staff row", async () => {
    // A secret that is only wildcards must not match; if the escape is dropped
    // from the query this is the assertion that would open the door.
    expect(await resolveSecret("%")).toBeNull();
    expect(await resolveSecret("_")).toBeNull();
    expect(await resolveSecret("*")).toBeNull();
    expect(await resolveSecret("kitchen%")).toBeNull();
    expect(await resolveSecret("kitch_n_1")).toBeNull();
  });

  it("unlocks a worker whose login id contains a wildcard character", async () => {
    // The regression the ESCAPE clause fixes: `_` is a real character in many
    // login ids (kitchen_1), and without ESCAPE the escaped query never matched.
    expect(await resolveSecret("kitchen_1")).toMatchObject({ userId: "staff-1" });
  });

  it("refuses an unknown or empty secret", async () => {
    expect(await resolveSecret("no-such-worker")).toBeNull();
    expect(await resolveSecret("")).toBeNull();
    expect(await resolveSecret("   ")).toBeNull();
  });

  it("refuses an inactive staff row", async () => {
    await db.prepare('UPDATE "staff" SET "is_active" = 0 WHERE "user_id" = ?1').bind("staff-1").run();
    expect(await resolveSecret("kitchen_1")).toBeNull();
  });
});

describe("unlock cookie round trip on D1", () => {
  it("verifies a minted staff cookie and re-reads the live role", async () => {
    await grantUnlock({ kind: "staff", userId: "staff-1", role: "kitchen", displayName: "Line Cook" });
    const identity = await gateIdentity();
    expect(identity).toMatchObject({ kind: "staff", userId: "staff-1", role: "kitchen" });
  });

  it("invalidates the cookie when the role changes, so a demotion takes effect", async () => {
    await grantUnlock({ kind: "staff", userId: "staff-1", role: "kitchen", displayName: "Line Cook" });
    await db.prepare('UPDATE "staff" SET "role" = ?1 WHERE "user_id" = ?2').bind("support", "staff-1").run();
    expect(await gateIdentity()).toBeNull();
  });

  it("invalidates the cookie when the row is deactivated", async () => {
    await grantUnlock({ kind: "staff", userId: "staff-1", role: "kitchen", displayName: "Line Cook" });
    await db.prepare('UPDATE "staff" SET "is_active" = 0 WHERE "user_id" = ?1').bind("staff-1").run();
    expect(await gateIdentity()).toBeNull();
  });

  it("rejects a hand-made staff cookie whose signature does not match", async () => {
    const forged = `${"a".repeat(64)}.staff:staff-1:owner`;
    cookies.set("panda-wok.admin", forged);
    expect(await gateIdentity()).toBeNull();
  });
});
