import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCheckoutConfig } from "@/lib/services/order-status";
import { getPublicSettings } from "@/lib/services/catalog";
import { getMyAddresses, getMyStats } from "@/lib/services/orders";

/**
 * Everything the checkout form needs for a signed-in customer: the preview
 * config, their saved addresses and their previous-order count. 401 when signed
 * out, which the client turns into the sign-in redirect the server page did.
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
    const [config, settings, addresses, stats] = await Promise.all([
      getCheckoutConfig(),
      getPublicSettings(),
      getMyAddresses(session.user.id),
      getMyStats(session.user.id),
    ]);
    const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;
    return NextResponse.json(
      {
        ok: true,
        data: {
          config,
          acceptingOrders: settings.ordering.acceptingOrders,
          addresses,
          defaultAddressId: defaultAddress?.id ?? null,
          customerPhone: session.profile?.phone ?? null,
          instapayUrl: settings.support.instapayUrl,
          previousOrders: stats.orderCount,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("checkout read failed", error);
    return NextResponse.json(
      { ok: false, error: "read_failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
