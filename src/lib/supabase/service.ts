import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { publicEnv, serverEnv, serviceRoleAvailable } from "@/lib/config/env";

let adminClient: ReturnType<typeof createSupabaseClient<Database>> | undefined;

/**
 * Service-role client for privileged server work: exports, backups, analytics
 * rollups, AI usage accounting, and the ops console (whose access is decided by
 * the passcode/login-id gate rather than by a Supabase auth session). Bypasses
 * RLS, so every call site must perform its own authorization check first. Never
 * imported into client code.
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
