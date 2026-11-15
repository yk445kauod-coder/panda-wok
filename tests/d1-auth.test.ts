/**
 * End-to-end tests for the D1 auth surface.
 *
 * These run the real code — real PBKDF2, real HMAC session, real SQL — against a
 * real SQLite engine with the real schema, so they check the thing that matters:
 * that a sign-up writes an account that a sign-in can then open, and that a
 * tampered cookie cannot become someone else. A mock would pass while the
 * signature check or the password comparison was wrong.
 *
 * The cookie store is an in-memory `Map` behind the `next/headers` mock, which
 * is the one unavoidable seam: there is no request in a unit test, and the
 * alternative is not exercising the session at all.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Must run before the imports below: `serverEnv` parses the environment once at
// module load, so a secret set inside a test body would arrive too late.
const cookies = vi.hoisted(() => {
  process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";
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

import { D1Client } from "@/lib/d1/client";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { SESSION_COOKIE, createSessionToken, readSessionToken } from "@/lib/auth/d1-session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));

let db: SqliteD1;

beforeAll(() => {
  db = createTestDatabase(readFileSync(schemaPath, "utf8"));
  setD1Database(db);
  setD1Context({ userId: null, restaurantId: "b54b2620-90c5-4295-b617-bc1389db3ee9", elevated: true });
});

beforeEach(() => {
  cookies.clear();
  db.exec('DELETE FROM "auth_users"; DELETE FROM "auth_identities"; DELETE FROM "profiles";');
});

function client(): D1Client {
  return new D1Client({ elevated: false, userId: null });
}

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently each time", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("refuses a malformed or missing record rather than throwing", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$12$abc$def")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$0$abc$def")).toBe(false);
  });
});

describe("session token", () => {
  it("round-trips a user id", async () => {
    const token = await createSessionToken("user-123");
    expect(token).toBeTruthy();
    const claims = await readSessionToken(token);
    expect(claims?.sub).toBe("user-123");
    expect(claims!.exp * 1000).toBeGreaterThan(Date.now());
  });

  it("rejects a token whose payload was edited", async () => {
    const token = await createSessionToken("user-123");
    const [, signature] = token!.split(".");
    // Forge a payload naming a different user, keeping the original signature.
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin-1", exp: 9999999999 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await readSessionToken(`${forgedPayload}.${signature}`)).toBeNull();
  });

  it("rejects a token with a broken signature and a missing token", async () => {
    const token = await createSessionToken("user-123");
    const [payload] = token!.split(".");
    expect(await readSessionToken(`${payload}.deadbeef`)).toBeNull();
    expect(await readSessionToken("garbage")).toBeNull();
    expect(await readSessionToken(undefined)).toBeNull();
    expect(await readSessionToken("")).toBeNull();
  });

  it("rejects an expired token", async () => {
    // A token signed correctly but with a past expiry must still be refused; the
    // signature covers `exp`, so this is the one way to produce that case.
    const expired = await createSessionToken("user-123");
    const realNow = Date.now;
    Date.now = () => realNow() + 9 * 60 * 60 * 1000;
    try {
      expect(await readSessionToken(expired)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

describe("sign-up → session → sign-out → sign-in", () => {
  it("creates an account, opens a session, and reads the user back", async () => {
    const auth = client().auth;

    const signup = await auth.signUp({
      email: "Customer@Example.com",
      password: "hunter2hunter2",
      options: { data: { full_name: "Test Customer", phone: "+201000000000" } },
    });
    expect(signup.error).toBeNull();
    const userId = signup.data.user?.id;
    expect(userId).toBeTruthy();
    // The cookie is set and is the signed session, not the raw user id.
    expect(cookies.get(SESSION_COOKIE)).toBeTruthy();
    expect(cookies.get(SESSION_COOKIE)).not.toBe(userId);

    const session = await auth.getUser();
    expect(session.data.user?.id).toBe(userId);
    expect(session.data.user?.email).toBe("customer@example.com");

    const claims = await auth.getClaims();
    expect(claims.data.claims?.sub).toBe(userId);
  });

  it("refuses a duplicate email and does not create a second row", async () => {
    const auth = client().auth;
    await auth.signUp({ email: "dupe@example.com", password: "password123" });
    const second = await auth.signUp({ email: "DUPE@example.com", password: "password456" });
    expect(second.error).not.toBeNull();

    const rows = await db.prepare('SELECT COUNT(*) AS n FROM "auth_users"').first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it("signs in with the right password and refuses the wrong one", async () => {
    const auth = client().auth;
    await auth.signUp({ email: "return@example.com", password: "correct-password" });

    // Sign out first, so the next sign-in has to re-establish the session.
    await auth.signOut();
    expect(cookies.get(SESSION_COOKIE)).toBeUndefined();

    const wrong = await auth.signInWithPassword({
      email: "return@example.com",
      password: "wrong-password",
    });
    expect(wrong.data.user).toBeNull();
    expect(wrong.error?.code).toBe("invalid_credentials");
    expect(cookies.get(SESSION_COOKIE)).toBeUndefined();

    const right = await auth.signInWithPassword({
      email: "return@example.com",
      password: "correct-password",
    });
    expect(right.error).toBeNull();
    expect(right.data.user?.email).toBe("return@example.com");
    expect(cookies.get(SESSION_COOKIE)).toBeTruthy();
  });

  it("does not reveal whether an address exists", async () => {
    const auth = client().auth;
    const unknown = await auth.signInWithPassword({ email: "nobody@example.com", password: "x" });
    expect(unknown.error?.code).toBe("invalid_credentials");
    expect(unknown.error?.message).toBe("Invalid login credentials");
  });

  it("treats a deleted account's session as no session", async () => {
    const auth = client().auth;
    const signup = await auth.signUp({ email: "gone@example.com", password: "password123" });
    const userId = signup.data.user!.id;
    await auth.admin.deleteUser(userId);
    const after = await auth.getUser();
    expect(after.data.user).toBeNull();
    expect(after.error).toBeNull();
  });

  it("stores no plaintext password anywhere in the row", async () => {
    const auth = client().auth;
    await auth.signUp({ email: "secret@example.com", password: "MyVerySecret123" });
    const row = await db
      .prepare('SELECT "encrypted_password" AS p FROM "auth_users" WHERE "email" = ?1')
      .bind("secret@example.com")
      .first<{ p: string }>();
    expect(row?.p).toBeTruthy();
    expect(row?.p).not.toContain("MyVerySecret123");
    expect(row?.p.startsWith("pbkdf2-sha256$")).toBe(true);
  });
});
