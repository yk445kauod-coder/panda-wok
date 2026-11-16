import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMyOrders } from "@/lib/services/orders";
import { getMyFeedback } from "@/lib/services/feedback";

/**
 * The signed-in customer's feedback page data: their recent orders (to attach a
 * review to) and everything they have already sent. 401 when signed out, which
 * the client renders as the sign-in prompt the server page showed.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: true, data: { signedIn: false } },
      { headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const [orders, previous] = await Promise.all([
      getMyOrders(session.user.id, 10),
      getMyFeedback(session.user.id),
    ]);
    return NextResponse.json(
      { ok: true, data: { signedIn: true, orders, previous } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("feedback read failed", error);
    return NextResponse.json(
      { ok: false, error: "read_failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
