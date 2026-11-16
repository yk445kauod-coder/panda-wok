import { NextResponse } from "next/server";
import { getCheckoutConfig } from "@/lib/services/order-status";

/**
 * The checkout preview configuration, for the static `/cart` shell.
 *
 * `tax.rate` and the per-item cap are not public settings, so the reader goes
 * through the service role — the same authoritative values `place_order` uses.
 * The browser gets only the preview numbers, never the setting rows.
 */
export async function GET() {
  try {
    const config = await getCheckoutConfig();
    return NextResponse.json(
      { ok: true, data: config },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("checkout config read failed", error);
    return NextResponse.json(
      { ok: false, error: "read_failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
