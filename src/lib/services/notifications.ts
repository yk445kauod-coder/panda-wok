import "server-only";

import { createServerSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";

export type NotificationAudience = "customer" | "staff";

export type AppNotification = {
  id: number;
  category: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function mapRow(row: {
  id: number;
  category: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}): AppNotification {
  return {
    id: row.id,
    category: row.category,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * Signed-in member's own notifications. The RPC prefers `auth.uid()`, so this
 * path serves the customer bell and any staff member who also has a Supabase
 * session.
 */
export async function listMyNotifications(
  audience: NotificationAudience,
  limit = 20,
): Promise<AppNotification[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("list_my_notifications", {
    p_audience: audience,
    p_limit: limit,
    p_unread_only: false,
  });

  if (error) return [];
  return (data ?? []).map(mapRow);
}

/** Unread count for the bell badge. Zero when signed out or on error. */
export async function countUnreadNotifications(
  audience: NotificationAudience,
): Promise<number> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("count_unread_notifications", {
    p_audience: audience,
  });
  if (error) return 0;
  return Number(data ?? 0);
}

/**
 * The passcode-gated ops console has no Supabase session, so `auth.uid()` is
 * null there and the RPCs above see nothing. This pair resolves the staff feed
 * through the service-role client with the server-derived id.
 *
 * Reads go through RLS-scoped policies where they can (the gate identity has no
 * auth.uid()), so the service role is required for the same reason
 * `getAdminSession` uses it to resolve an actor: there is no session to read
 * from. The id is never taken from the browser.
 */
async function staffContext(): Promise<{ admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>; userId: string } | null> {
  const session = await getAdminSession().catch(() => null);
  if (!session?.actorId) return null;
  const admin = tryCreateAdminSupabase();
  if (!admin) return null;
  return { admin, userId: session.actorId };
}

export async function listStaffNotifications(limit = 20): Promise<AppNotification[]> {
  const context = await staffContext();
  if (!context) return [];
  const { data, error } = await context.admin.rpc("list_my_notifications", {
    p_audience: "staff",
    p_limit: limit,
    p_unread_only: false,
    p_user_id: context.userId,
  });
  if (error) return [];
  return (data ?? []).map(mapRow);
}

export async function countStaffUnread(): Promise<number> {
  const context = await staffContext();
  if (!context) return 0;
  const { data, error } = await context.admin.rpc("count_unread_notifications", {
    p_audience: "staff",
    p_user_id: context.userId,
  });
  if (error) return 0;
  return Number(data ?? 0);
}

export async function markStaffNotificationRead(id: number): Promise<boolean> {
  const context = await staffContext();
  if (!context) return false;
  const { error } = await context.admin.rpc("mark_notification_read", {
    p_id: id,
    p_user_id: context.userId,
  });
  return !error;
}

export async function markAllStaffNotificationsRead(): Promise<boolean> {
  const context = await staffContext();
  if (!context) return false;
  const { error } = await context.admin.rpc("mark_all_notifications_read", {
    p_audience: "staff",
    p_user_id: context.userId,
  });
  return !error;
}

/**
 * Fan-out helpers for the chat surfaces. Both are best-effort: a notification
 * that fails to write must never fail the message that triggered it, so every
 * call swallows its error and returns quietly.
 *
 * They run through the service-role client because the writer RPCs are
 * service_role-only by design — a customer must not be able to forge a
 * notification for another user.
 */
export async function notifyStaffOfCustomerMessage(input: {
  conversationId: string;
  preview: string;
}): Promise<void> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return;
  await admin
    .rpc("notify_staff", {
      p_roles: ["owner", "admin", "support", "marketing"],
      p_category: "chat",
      p_kind: "customer_message",
      p_title: "New customer message",
      p_body: input.preview.slice(0, 160),
      p_link: `/admin/chat/${input.conversationId}`,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

export async function notifyCustomerOfStaffReply(input: {
  userId: string;
  conversationId: string;
  preview: string;
}): Promise<void> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return;
  await admin
    .rpc("create_notification", {
      p_user_id: input.userId,
      p_audience: "customer",
      p_category: "chat",
      p_kind: "staff_reply",
      p_title: "The kitchen replied",
      p_body: input.preview.slice(0, 160),
      p_link: "/chat",
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
