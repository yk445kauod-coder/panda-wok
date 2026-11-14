import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/types/database";
import { publicEnv, serviceRoleAvailable } from "@/lib/config/env";
import { gateIdentity } from "@/lib/auth/admin-gate";
import {
  createAdminSupabase,
  tryCreateAdminSupabase,
} from "@/lib/supabase/service";

export type SupabaseServerClient = ReturnType<typeof createServerClient<Database>>;

/** Re-exported so privileged call sites keep importing from one place. */
export { createAdminSupabase, tryCreateAdminSupabase };

/**
 * Request-scoped client bound to the caller's cookies. All queries run as the
 * signed-in user, so RLS is the enforcement point, not application code.
 *
 * One exception: a request to the ops surface itself (`/admin`, flagged by the
 * middleware with `x-pw-path`) that carries a valid gate cookie runs with the
 * service role. The ops console is opened with the passcode/login-id gate rather
 * than a Supabase auth session, so without this the staff RLS policies — which
 * resolve through `auth.uid()` — would authorise nothing and every admin screen
 * would silently render empty. The elevation is scoped to the admin path, so an
 * owner browsing the customer site still reads through their own session.
 */
export async function createServerSupabase(): Promise<SupabaseServerClient> {
  const headerList = await headers();
  const path = headerList.get("x-pw-path") ?? "";
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    const identity = await gateIdentity();
    if (identity && serviceRoleAvailable()) {
      return createAdminSupabase() as unknown as SupabaseServerClient;
    }
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Session refresh is handled
            // by middleware, so this is safe to ignore here.
          }
        },
      },
    },
  );
}

/**
 * Request-scoped client bound to the caller's cookies, *never* elevated.
 *
 * `createServerSupabase` runs the ops surface as the service role, which is
 * right for reading console data but wrong for anything that touches the
 * caller's own auth session: a service-role client has no user session to sign
 * in, and `verifyOtp` on one would write the minted tokens into the wrong
 * cookie namespace. Session work (minting a staff session, signing out) goes
 * through this client instead, so the tokens land on the anon-key cookie the
 * browser client reads.
 */
export async function createSessionSupabase(): Promise<SupabaseServerClient> {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}

/**
 * Cookie-free anon client for public reads: the menu, categories, published
 * settings and other data every visitor sees identically. Not reading cookies
 * keeps these queries out of the per-request dynamic path, so public pages can
 * be statically rendered and cached, and `generateStaticParams` can call them at
 * build time. RLS still decides what an anonymous visitor may select.
 */
export function createPublicSupabase() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
