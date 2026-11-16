import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMyAddresses } from "@/lib/services/orders";

/**
 * The signed-in customer's saved addresses, for the static
 * `/account/addresses` shell. `getSession` reads the session cookie, so the
 * Worker never renders the page — the browser asks here instead and gets 401
 * when signed out, which the client turns into the sign-in redirect the server
 * page used to perform.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const addresses = await getMyAddresses(session.user.id);
    return NextResponse.json(
      { ok: true, data: { addresses } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("addresses read failed", error);
    return NextResponse.json(
      { ok: false, error: "read_failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
