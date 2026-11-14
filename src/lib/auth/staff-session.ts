import "server-only";

import { cookies } from "next/headers";

import { createSessionSupabase } from "@/lib/supabase/server";

/**
 * Marks a session the console once minted for itself.
 *
 * The console used to swap a gate-cookie unlock for a real Supabase session, so
 * its realtime channel would carry a row-level feed. That is gone: the session
 * made the browser hold a staff token it did not need, and the row-level feed it
 * was meant to enable never actually delivered (see `use-ops-signal`). The live
 * signal now rides the public `ops-orders` broadcast, which needs no session.
 *
 * This cookie and the sign-out below are kept only to clean up browsers that
 * already hold a minted session from before the removal: locking the console
 * still ends it, so a shared kitchen terminal does not keep a staff token.
 */
export const MINTED_COOKIE = "panda-wok.admin-minted";

/**
 * Ends a console-minted session when the console is locked.
 *
 * The gate cookie is what opens `/admin`, but a minted session is a live token
 * that can reach PostgREST on its own — leaving it behind after a lock would let
 * the next person on this browser read staff data through the API even with the
 * console closed. Only a session the console minted is ended; a session the
 * visitor arrived with is theirs to keep.
 */
export async function endMintedSession(): Promise<void> {
  const store = await cookies();
  if (store.get(MINTED_COOKIE)?.value !== "1") return;
  store.delete(MINTED_COOKIE);
  try {
    const supabase = await createSessionSupabase();
    await supabase.auth.signOut();
  } catch {
    // The cookie is already gone; a failed sign-out only leaves a token that
    // expires on its own.
  }
}
