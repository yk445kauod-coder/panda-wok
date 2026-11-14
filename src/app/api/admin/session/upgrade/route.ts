import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { gateIdentity } from "@/lib/auth/admin-gate";
import { MINTED_COOKIE, mintStaffSession } from "@/lib/auth/staff-session";

/**
 * Upgrades an already-unlocked console to a real Supabase session.
 *
 * Minting a session is a chain of Supabase round trips (a profile read, a token
 * verify, a magic-link generate, an OTP redeem). Running that inside
 * `unlockAdminAction` put all of it on the same Worker request as the unlock,
 * which is the request a staff member is staring at — and on the Free plan a
 * chain that long is what tips the request over the 10 ms CPU cap, surfacing as
 * "something went wrong" on the login button. The unlock now returns as soon as
 * the gate cookie is set, and the browser calls this endpoint afterwards.
 *
 * Idempotent and cheap on repeat calls: the minted marker is checked before any
 * Supabase round trip, so re-opening the console does not re-mint.
 *
 * Best-effort by design: a failure leaves the console on the cookie gate, where
 * the public `ops-orders` broadcast and the visible-only poll still deliver
 * updates. Gated on the unlock cookie, so it can only ever mint for a browser
 * that already passed the gate.
 */
export async function POST() {
  const store = await cookies();
  if (store.get(MINTED_COOKIE)?.value === "1") {
    return NextResponse.json({ ok: true });
  }

  const identity = await gateIdentity();
  if (!identity) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    await mintStaffSession(identity);
  } catch {
    // The console keeps working on the broadcast signal and the poll.
  }
  return NextResponse.json({ ok: true });
}
