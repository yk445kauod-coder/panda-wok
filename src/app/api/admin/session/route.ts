import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { capabilitiesFor, can, ROLE_LABELS } from "@/lib/auth/rbac";
import { getPublicSettings } from "@/lib/services/catalog";
import { listStaffNotifications, countStaffUnread } from "@/lib/services/notifications";
import { getPendingNewOrders } from "@/lib/services/admin-orders";
import { serverEnv } from "@/lib/config/env";

/**
 * Everything the console chrome needs to render itself, as JSON.
 *
 * The admin layout used to read this on the server, which meant the Worker ran
 * a React render, four Supabase reads and a cookie check for *every* console
 * document. `/admin` is now a static shell, so the browser asks this endpoint
 * once on load instead. Gated on the unlock cookie: a locked caller gets
 * `{ unlocked: false }` and the client shows the passcode field.
 */
export async function GET() {
  const [session, settings] = await Promise.all([
    getAdminSession().catch(() => null),
    getPublicSettings().catch(() => null),
  ]);

  const brand =
    settings && settings.brand
      ? { name: settings.brand.name, logo_url: settings.brand.logo_url ?? null }
      : { name: "Panda Wok", logo_url: null };

  if (!session) {
    return NextResponse.json({ ok: true, unlocked: false, brand });
  }

  const [notifications, unread, pendingOrders] = await Promise.all([
    listStaffNotifications(20).catch(() => []),
    countStaffUnread().catch(() => 0),
    can(session.role, "orders.view")
      ? getPendingNewOrders().catch(() => [])
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    ok: true,
    unlocked: true,
    // The console opens its live socket to this origin. Carried on the session
    // response so the browser needs no extra request to learn it, and absent when
    // the deployment has no hub — the socket then simply does not open.
    opsHubUrl: serverEnv.OPS_HUB_URL ?? null,
    role: session.role,
    capabilities: capabilitiesFor(session.role),
    staffName: session.profile?.full_name ?? ROLE_LABELS[session.role],
    brand,
    notifications,
    unreadCount: unread,
    pendingOrders,
  });
}
