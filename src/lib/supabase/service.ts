import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { publicEnv } from "@/lib/config/public-env";
import { serverEnv, serviceRoleAvailable } from "@/lib/config/env";
import { isD1Backend } from "@/lib/d1/backend";
import { D1Client } from "@/lib/d1/client";
import { bindD1FromCloudflare, setD1Context } from "@/lib/d1/database";

let adminClient: ReturnType<typeof createSupabaseClient<Database>> | undefined;
let d1AdminClient: unknown;

/**
 * Service-role client for privileged server work: exports, backups, analytics
 * rollups, AI usage accounting, and the ops console (whose access is decided by
 * the passcode/login-id gate rather than by a Supabase auth session). Bypasses
 * RLS, so every call site must perform its own authorization check first. Never
 * imported into client code.
 */
export function createAdminSupabase() {
  // The D1 backend has no RLS, so "elevated" is the default there rather than a
  // separate service-role credential. Every D1 admin call site already performed
  // its own gate check (that is what the Supabase path's service role required
  // too), so this does not widen access — it removes the need for a key that
  // only existed to bypass policies D1 does not have.
  if (isD1Backend()) {
    bindD1FromCloudflare();
    // Set on every call, not only at construction: the D1 context is module
    // state that `createD1ServerClient` rewrites per request, and the client
    // below is cached for the isolate. Without re-asserting elevation here, a
    // request that built a customer client first would leave the shared context
    // unauthorised and the next privileged read would come back empty.
    setD1Context({ elevated: true });
    if (!d1AdminClient) d1AdminClient = new D1Client({ elevated: true, userId: null });
    return d1AdminClient as unknown as ReturnType<typeof createSupabaseClient<Database>>;
  }

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
  // On D1 elevation is always available (no key to check for), so this returns a
  // client rather than null — otherwise every `if (admin)` branch in the signup
  // and identity-lookup paths would silently take the degraded route.
  if (isD1Backend()) return createAdminSupabase();
  return serviceRoleAvailable() ? createAdminSupabase() : null;
}
