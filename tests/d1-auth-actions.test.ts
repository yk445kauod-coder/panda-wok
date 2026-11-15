/**
 * The customer auth server actions, run end to end on the D1 backend.
 *
 * `d1-auth.test.ts` proves the auth client works; this proves the *actions* the
 * forms call do — including the paths that do not go through `supabase.auth` at
 * all. The signup action creates the profile row itself on D1 (Supabase had a
 * `handle_new_user` trigger; D1 has none), so this is the test that catches that
 * row going missing, which would leave an account that can sign in and then
 * render as a stranger with no profile.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.hoisted(() => {
  process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";
  process.env.DATA_BACKEND = "d1";
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

vi.mock("next/cache", () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

// The middleware sets this header for admin requests; the D1 server client reads
// it to decide elevation. A customer sign-up is not an admin path.
vi.mock("@/lib/seo/metadata", () => ({ siteUrl: () => "https://panda-wok.pages.dev" }));

import { signInAction, signUpAction, signOutAction } from "@/lib/actions/auth";
import { getSession } from "@/lib/auth/session";
import { setD1Context, setD1Database } from "@/lib/d1/database";
import { createTestDatabase, type SqliteD1 } from "./helpers/sqlite-d1";

const schemaPath = fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url));

let db: SqliteD1;

beforeAll(() => {
  db = createTestDatabase(readFileSync(schemaPath, "utf8"));
  setD1Database(db);
  setD1Context({ userId: null, restaurantId: "b54b2620-90c5-4295-b617-bc1389db3ee9", elevated: false });
});

beforeEach(() => {
  cookies.clear();
  db.exec('DELETE FROM "auth_users"; DELETE FROM "auth_identities"; DELETE FROM "profiles"; DELETE FROM "activity_logs";');
  setD1Context({ userId: null, restaurantId: "b54b2620-90c5-4295-b617-bc1389db3ee9", elevated: false });
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("signUpAction on D1", () => {
  it("creates the auth user AND the profile row, then opens a session", async () => {
    const result = await signUpAction(
      form({
        fullName: "Yousef Test",
        phone: "+201234567890",
        email: "yousef@example.com",
        password: "password123",
        locale: "ar",
      }),
    );
    expect(result.ok).toBe(true);

    const user = await db.prepare('SELECT "id" FROM "auth_users"').first<{ id: string }>();
    expect(user?.id).toBeTruthy();

    // The profile is the row Supabase's trigger would have written. Without it
    // the account signs in and then has no name, phone or locale.
    const profile = await db
      .prepare('SELECT "full_name" AS n, "phone" AS p, "locale" AS l, "email" AS e FROM "profiles" WHERE "id" = ?1')
      .bind(user!.id)
      .first<{ n: string; p: string; l: string; e: string }>();
    expect(profile).toBeTruthy();
    expect(profile?.n).toBe("Yousef Test");
    expect(profile?.p).toBe("+201234567890");
    expect(profile?.l).toBe("ar");
    expect(profile?.e).toBe("yousef@example.com");
  });

  it("signs the new customer in, so the next request sees the session", async () => {
    await signUpAction(
      form({
        fullName: "Session Test",
        phone: "+201111111111",
        email: "session@example.com",
        password: "password123",
        locale: "en",
      }),
    );

    const user = await db.prepare('SELECT "id" FROM "auth_users"').first<{ id: string }>();
    setD1Context({ userId: user!.id, restaurantId: "b54b2620-90c5-4295-b617-bc1389db3ee9", elevated: false });

    const session = await getSession();
    expect(session?.user.id).toBe(user!.id);
    expect(session?.profile?.full_name).toBe("Session Test");
  });

  it("rejects a duplicate phone before touching the auth table", async () => {
    await signUpAction(
      form({ fullName: "First", phone: "+201555555555", email: "first@example.com", password: "password123", locale: "en" }),
    );
    const second = await signUpAction(
      form({ fullName: "Second", phone: "+201555555555", email: "second@example.com", password: "password456", locale: "en" }),
    );
    expect(second.ok).toBe(false);

    const count = await db.prepare('SELECT COUNT(*) AS n FROM "auth_users"').first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});

describe("signInAction on D1", () => {
  it("signs a created account back in by email", async () => {
    await signUpAction(
      form({ fullName: "Return", phone: "+201666666666", email: "return@example.com", password: "password123", locale: "en" }),
    );
    await signOutAction().catch(() => {});
    cookies.clear();

    const result = await signInAction(form({ email: "return@example.com", password: "password123" }));
    expect(result.ok).toBe(true);

    const user = await db.prepare('SELECT "id" FROM "auth_users"').first<{ id: string }>();
    setD1Context({ userId: user!.id, restaurantId: "b54b2620-90c5-4295-b617-bc1389db3ee9", elevated: false });
    expect((await getSession())?.user.id).toBe(user!.id);
  });

  it("refuses a wrong password with the neutral message", async () => {
    await signUpAction(
      form({ fullName: "Wrong", phone: "+201777777777", email: "wrong@example.com", password: "password123", locale: "en" }),
    );
    cookies.clear();

    const result = await signInAction(form({ email: "wrong@example.com", password: "not-the-password" }));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain("INVALID_CREDENTIALS");
  });
});
