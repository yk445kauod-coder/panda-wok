import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMyOrders } from "@/lib/services/orders";

/** The signed-in customer's order history, for the static `/orders` shell. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20") || 20;
  try {
    const orders = await getMyOrders(session.user.id, Math.min(Math.max(limit, 1), 100));
    return NextResponse.json(
      { ok: true, data: { orders } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("orders read failed", error);
    return NextResponse.json(
      { ok: false, error: "read_failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
