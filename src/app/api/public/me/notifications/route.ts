import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  countUnreadNotifications,
  listMyNotifications,
} from "@/lib/services/notifications";

/**
 * The signed-in customer's notification feed, for the static customer shell.
 *
 * The shell is prerendered per locale, so it cannot know at build time whether
 * the visitor is signed in. It used to ask through a Server Action
 * (`loadMyNotificationsAction`); a Next Server Action is a POST back to the
 * *page* it was declared on, and every customer page is a static shell, so that
 * POST re-ran the App Router to re-emit a static document — one of the request
 * shapes that exceeds the Free plan's 10 ms CPU cap (Error 1102). This route is
 * a plain GET: one cheap invocation, one session check, and a `signedIn: false`
 * payload when signed out, which the client renders as "no bell" exactly as
 * before.
 */
export async function GET() {
  const session = await getSession().catch(() => null);
  if (!session) {
    return NextResponse.json(
      { ok: true, data: { signedIn: false, notifications: [], unread: 0 } },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const [notifications, unread] = await Promise.all([
      listMyNotifications("customer", 20).catch(() => []),
      countUnreadNotifications("customer").catch(() => 0),
    ]);
    return NextResponse.json(
      { ok: true, data: { signedIn: true, notifications, unread } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("notifications read failed", error);
    return NextResponse.json(
      { ok: true, data: { signedIn: false, notifications: [], unread: 0 } },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
