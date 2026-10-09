import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { publicEnv } from "@/lib/config/env";

let cached: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser Supabase client. Uses the publishable key only, never the service role. */
export function createClient() {
  if (!cached) {
    cached = createBrowserClient<Database>(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return cached;
}
