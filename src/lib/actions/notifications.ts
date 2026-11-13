"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminSession, getSession } from "@/lib/auth/session";
import {
  countUnreadNotifications,
  listMyNotifications,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
  type AppNotification,
} from "@/lib/services/notifications";
import { actionOk, actionError, type ActionResult } from "@/lib/actions/result";

/**
 * Notifications are private to the member and every RPC filters by identity, so
 * these actions take no ownership argument from the client. There are two
 * paths, matching the two ways a member is authenticated:
 *
 * - A signed-in visitor (customer, or a staff member who also has a session)
 *   goes through the RLS-scoped client, where the RPC uses `auth.uid()`.
 * - A passcode-unlocked ops member has no session, so the staff service
 *   resolves the identity from the gate cookie on the server. `audience` and
 *   the target id still never come from the browser as a trust boundary.
 */

export async function markNotificationReadAction(id: number): Promise<ActionResult> {
  try {
    const session = await getAdminSession().catch(() => null);
    // A gate session belongs to staff and has no auth.uid(); everything else
    // is the caller's own session.
    if (session && !session.user) {
      const ok = await markStaffNotificationRead(id);
      return ok ? actionOk() : actionError(new Error("Not marked read"));
    }

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
    if (error) return actionError(error);
    return actionOk();
  } catch (error) {
    return actionError(error);
  }
}

export async function markAllNotificationsReadAction(
  audience: "customer" | "staff",
): Promise<ActionResult> {
  try {
    const session = await getAdminSession().catch(() => null);
    if (audience === "staff" && session && !session.user) {
      const ok = await markAllStaffNotificationsRead();
      return ok ? actionOk() : actionError(new Error("Not cleared"));
    }

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("mark_all_notifications_read", {
      p_audience: audience === "staff" ? "staff" : "customer",
    });
    if (error) return actionError(error);
    return actionOk();
  } catch (error) {
    return actionError(error);
  }
}

/**
 * The viewer's own customer feed, for the header bell.
 *
 * The public pages are prerendered, so the shell cannot read the session while
 * rendering. The bell hydrates here instead: an anonymous visitor gets
 * `signedIn: false` and no bell, a signed-in one gets their first page of
 * notifications, and no page has to leave the static path to find out which.
 */
export async function loadMyNotificationsAction(): Promise<{
  signedIn: boolean;
  notifications: AppNotification[];
  unread: number;
}> {
  const session = await getSession().catch(() => null);
  if (!session) return { signedIn: false, notifications: [], unread: 0 };

  const [notifications, unread] = await Promise.all([
    listMyNotifications("customer", 20).catch(() => []),
    countUnreadNotifications("customer").catch(() => 0),
  ]);
  return { signedIn: true, notifications, unread };
}
