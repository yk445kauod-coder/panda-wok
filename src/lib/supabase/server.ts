import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";
import { publicEnv, serverEnv, serviceRoleAvailable } from "@/lib/config/env";

export type SupabaseServerClient = ReturnType<typeof createServerClient<Database>>;

/**
 * Request-scoped client bound to the caller's cookies. All queries run as the
 * signed-in user, so RLS is the enforcement point, not application code.
 */
export async function createServerSupabase(): Promise<SupabaseServerClient> {
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

let adminClient: ReturnType<typeof createSupabaseClient<Database>> | undefined;

/**
 * Service-role client for privileged server work: exports, backups, analytics
 * rollups, AI usage accounting. Bypasses RLS, so every call site must perform
 * its own authorization check first. Never imported into client code.
 */
export function createAdminSupabase() {
  if (!serviceRoleAvailable()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured; privileged operations are unavailable.",
    );
  }
  if (!adminClient) {
    adminClient = createSupabaseClient<Database>(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      serverEnv.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }
  return adminClient;
}

export function tryCreateAdminSupabase() {
  return serviceRoleAvailable() ? createAdminSupabase() : null;
}
