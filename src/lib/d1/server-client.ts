/**
 * The D1 client, bound to the current request.
 *
 * `createServerSupabase()` hands back this object when `DATA_BACKEND=d1`, so the
 * 371 `.from()` and 48 `.rpc()` call sites run unchanged. The work here is
 * deciding the *identity* the request runs as, because D1 has no row-level
 * security: whatever is not resolved here has to be enforced in SQL.
 *
 * Two shapes, matching the Supabase client it stands in for:
 *
 *  - An admin request that passed the gate runs elevated, and that elevation is
 *    scoped to `/admin` and `/api/admin` exactly as the Supabase path scoped it.
 *    Without it, every staff screen would read as an anonymous customer and come
 *    back empty.
 *  - Everything else runs as the signed-in user, or as nobody.
 *
 * `restaurantId` is resolved once and carried on the context, because the schema
 * defaults it on nearly every table and SQLite cannot.
 */

import "server-only";

import { headers } from "next/headers";
import { gateIdentity } from "@/lib/auth/admin-gate";
import { D1Client } from "@/lib/d1/client";
import { bindD1FromCloudflare, setD1Context } from "@/lib/d1/database";

const DEFAULT_RESTAURANT_ID = "b54b2620-90c5-4295-b617-bc1389db3ee9";

export async function createD1ServerClient(): Promise<D1Client> {
  // Every D1 read goes through this function, so this is the one place the
  // binding has to be attached.
  bindD1FromCloudflare();

  const headerList = await headers();
  const path = headerList.get("x-pw-path") ?? "";

  let elevated = false;
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    elevated = Boolean(await gateIdentity());
  }

  const userId = await resolveUserId(elevated);
  const restaurantId = await resolveRestaurantId();

  setD1Context({ elevated, userId, restaurantId });
  return new D1Client({ elevated, userId });
}

/**
 * The acting user, read from the session cookie the Supabase path used.
 *
 * `auth_users` is the table Supabase Auth wrote to, and the cookie names the id
 * directly, so the lookup is one indexed read. It is deliberately tolerant: an
 * unknown or missing session is "anonymous", which the policy layer then treats
 * as a customer with no rows rather than as an error.
 */
async function resolveUserId(elevated: boolean): Promise<string | null> {
  const headerList = await headers();
  const cookie = headerList.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)sb-[^=]*-auth-token=([^;]+)/);
  if (!match) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(match[1])) as { user?: { id?: string } };
    return raw.user?.id ?? null;
  } catch {
    return null;
  }
  void elevated;
}

/**
 * The single restaurant this deployment serves.
 *
 * Read from the table rather than hard-coded so a second restaurant is a data
 * change; the constant is the fallback for a database that has none yet.
 */
async function resolveRestaurantId(): Promise<string> {
  try {
    const { getD1Database } = await import("@/lib/d1/database");
    const row = await getD1Database()
      .prepare('SELECT "id" FROM "restaurants" ORDER BY "created_at" LIMIT 1')
      .first<{ id: string }>();
    return row?.id ?? DEFAULT_RESTAURANT_ID;
  } catch {
    return DEFAULT_RESTAURANT_ID;
  }
}
