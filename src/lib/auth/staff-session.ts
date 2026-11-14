import "server-only";

import { cookies } from "next/headers";

import { createSessionSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/service";
import type { GateIdentity } from "@/lib/auth/admin-gate";

/**
 * The founding owner account, which a passcode unlock acts as.
 *
 * The shared passcode has no staff row of its own — it is the console's "any
 * owner" credential — so the session it mints has to belong to a real account.
 * This is the same account the staff bootstrap migration promotes, so the
 * console and the database already agree on who the passcode is.
 */
const OWNER_EMAIL = "yk445kauod@gmail.com";

/**
 * Marks a session the console itself minted, so locking the console can end that
 * session without touching a session the visitor already had. httpOnly: the
 * browser never needs to read it, only the server decides on it.
 */
export const MINTED_COOKIE = "panda-wok.admin-minted";

/**
 * Gives the acting member a real Supabase session for the browser.
 *
 * Why: the console's live updates ride a Supabase Realtime channel, and a
 * `postgres_changes` subscription only delivers to a session — the staff RLS
 * policies resolve through `auth.uid()`, which a gate cookie does not have.
 * Without a session the console has to fall back to polling. With one, the
 * browser holds a token and the row-level subscription works, so boards update
 * on push instead of on a timer.
 *
 * How: mint a one-time magic-link token for the member with the service role,
 * then redeem it *through the anon-key cookie client* so the resulting access
 * and refresh tokens are written to the same `sb-<ref>-auth-token` cookies the
 * browser and the SSR middleware read. No email is sent (the token is redeemed
 * in-process), so this needs no SMTP. The member's credential is unchanged: the
 * same single passcode/login-id field unlocks the console as before.
 *
 * Best-effort: any failure leaves the console working on the cookie gate — it
 * just falls back to the broadcast signal and the poll. A missing service role
 * simply skips the upgrade.
 *
 * A session the visitor *already* holds is never clobbered: an owner who is
 * signed in as themselves already has the right session, and a customer who is
 * also staff keeps their customer session (the console then uses the broadcast
 * fallback rather than swapping them out of their own account).
 */
export async function mintStaffSession(identity: GateIdentity): Promise<void> {
  let admin: ReturnType<typeof createAdminSupabase>;
  try {
    admin = createAdminSupabase();
  } catch {
    return;
  }

  let email: string | null = null;
  if (identity.kind === "staff") {
    const { data } = await admin
      .from("profiles")
      .select("email")
      .eq("id", identity.userId)
      .maybeSingle();
    email = data?.email ?? null;
  } else {
    email = OWNER_EMAIL;
  }
  if (!email) return;

  const supabase = await createSessionSupabase();

  const { data: existing } = await supabase.auth.getUser();
  const existingEmail = existing.user?.email ?? null;
  if (existing.user && existingEmail) {
    if (existingEmail.toLowerCase() === email.toLowerCase()) return;
    // Someone else's session is live in this browser; do not sign them out.
    return;
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return;

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError) return;

  const store = await cookies();
  store.set(MINTED_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

/**
 * Ends a console-minted session when the console is locked.
 *
 * The gate cookie is what opens `/admin`, but the minted session is a live
 * token that can reach PostgREST on its own — leaving it behind after a lock
 * would let the next person on this browser read staff data through the API
 * even with the console closed. Only a session the console minted is ended;
 * a session the visitor arrived with is theirs to keep.
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

