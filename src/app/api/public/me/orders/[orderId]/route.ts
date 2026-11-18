import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/services/orders";
import { getPublicSettings } from "@/lib/services/catalog";

/**
 * One order for the tracking page, scoped to the signed-in customer.
 *
 * The D1 backend has no row-level security, so `getOrderForViewer` takes the
 * viewer's id and filters by it — another customer's order returns `null` and
 * the client shows the not-found panel. The tracking page also needs the support
 * phone (for a help link), which comes from the public settings.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const { orderId } = await params;
  try {
    const [order, settings] = await Promise.all([
      getOrderForViewer(orderId, session.user.id),
      getPublicSettings(),
    ]);
    return NextResponse.json(
      { ok: true, data: { order, supportPhone: settings.support.phone } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("order read failed", error);
    return NextResponse.json(
      { ok: false, error: "read_failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
