import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];

export type ConversationWithMessages = Conversation & { messages: Message[] };

/** The caller's own threads, newest activity first. RLS scopes the rows. */
export async function getMyConversations(userId: string): Promise<Conversation[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false });

  if (error) throw new Error(`Failed to load your conversations: ${error.message}`);
  return data ?? [];
}

/**
 * A thread with its messages. Internal notes are filtered out for customers —
 * the RLS policy already hides them, and this is a second, explicit guard.
 */
export async function getConversationForViewer(
  conversationId: string,
): Promise<ConversationWithMessages | null> {
  const supabase = await createServerSupabase();

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the conversation: ${error.message}`);
  if (!conversation) return null;

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("is_internal_note", false)
    .order("created_at", { ascending: true })
    .limit(200);

  if (messagesError) {
    throw new Error(`Failed to load messages: ${messagesError.message}`);
  }

  return { ...conversation, messages: messages ?? [] };
}

/** Staff view: includes internal notes and customer context. */
export async function getConversationForStaff(
  conversationId: string,
): Promise<
  | (ConversationWithMessages & {
      customer: { id: string; full_name: string | null; phone: string | null } | null;
    })
  | null
> {
  const supabase = await createServerSupabase();

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("*, profiles (id, full_name, phone)")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the conversation: ${error.message}`);
  if (!conversation) return null;

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (messagesError) {
    throw new Error(`Failed to load messages: ${messagesError.message}`);
  }

  const profile = (conversation as unknown as {
    profiles?: { id: string; full_name: string | null; phone: string | null } | null;
  }).profiles;

  return {
    ...(conversation as unknown as Conversation),
    messages: messages ?? [],
    customer: profile ?? null,
  };
}

export type InboxRow = {
  id: string;
  subject: string | null;
  status: Conversation["status"];
  last_message_at: string;
  staff_unread: number;
  customer_name: string | null;
  customer_phone: string | null;
  related_order_id: string | null;
};

/** Staff inbox rows, with the customer name joined in. */
export async function listInbox(params: {
  status?: Conversation["status"];
  limit?: number;
}): Promise<InboxRow[]> {
  const supabase = await createServerSupabase();

  let query = supabase
    .from("conversations")
    .select(
      "id, subject, status, last_message_at, staff_unread, related_order_id, profiles (full_name, phone)",
    )
    .order("last_message_at", { ascending: false })
    .limit(params.limit ?? 50);

  if (params.status) query = query.eq("status", params.status);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load the inbox: ${error.message}`);

  return (data ?? []).map((row) => {
    const profile = (row as unknown as {
      profiles?: { full_name: string | null; phone: string | null } | null;
    }).profiles;
    return {
      id: row.id,
      subject: row.subject,
      status: row.status,
      last_message_at: row.last_message_at,
      staff_unread: row.staff_unread,
      customer_name: profile?.full_name ?? null,
      customer_phone: profile?.phone ?? null,
      related_order_id: row.related_order_id,
    };
  });
}

export async function countUnreadForStaff(): Promise<number> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select("staff_unread")
    .gt("staff_unread", 0);

  if (error) return 0;
  return (data ?? []).reduce((sum, row) => sum + (row.staff_unread ?? 0), 0);
}

export type InboxRowWithPreview = InboxRow & {
  /** Body of the newest message, or null when the thread has none yet. */
  last_message: string | null;
  last_message_kind: string | null;
  last_message_from_staff: boolean;
};

/**
 * The staff inbox with a preview of the newest message in each thread. The
 * preview is fetched in one extra query rather than one per row, so a busy
 * inbox stays a constant number of round trips.
 */
export async function listInboxWithPreview(params: {
  status?: Conversation["status"];
  limit?: number;
}): Promise<InboxRowWithPreview[]> {
  const rows = await listInbox(params);
  if (rows.length === 0) return [];

  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("messages")
    .select("conversation_id, body, sender_kind, is_internal_note, created_at")
    .in(
      "conversation_id",
      rows.map((row) => row.id),
    )
    .order("created_at", { ascending: false })
    .limit(rows.length * 5);

  const previews = new Map<string, { body: string; kind: string; staff: boolean }>();
  for (const message of data ?? []) {
    if (previews.has(message.conversation_id)) continue;
    previews.set(message.conversation_id, {
      body: message.is_internal_note ? `Note: ${message.body}` : message.body,
      kind: message.sender_kind,
      staff: message.sender_kind !== "customer",
    });
  }

  return rows.map((row) => {
    const preview = previews.get(row.id);
    return {
      ...row,
      last_message: preview?.body ?? null,
      last_message_kind: preview?.kind ?? null,
      last_message_from_staff: preview?.staff ?? false,
    };
  });
}

export type RecentMessage = Message & {
  conversation: {
    id: string;
    subject: string | null;
    status: Conversation["status"];
  } | null;
  customer_name: string | null;
};

/**
 * The freshest customer-authored messages across every thread, for the staff
 * notification inbox. Internal notes and staff replies are excluded: this view
 * exists to show what customers are waiting on.
 */
export async function listRecentCustomerMessages(
  limit = 40,
): Promise<RecentMessage[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("messages")
    .select(
      "*, conversations (id, subject, status, profiles (full_name))",
    )
    .eq("sender_kind", "customer")
    .eq("is_internal_note", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load recent messages: ${error.message}`);

  return (data ?? []).map((row) => {
    const conversation = (row as unknown as {
      conversations?: {
        id: string;
        subject: string | null;
        status: Conversation["status"];
        profiles?: { full_name: string | null } | null;
      } | null;
    }).conversations;

    const { conversations: _ignored, ...message } = row as unknown as Message & {
      conversations?: unknown;
    };

    return {
      ...(message as Message),
      conversation: conversation
        ? {
            id: conversation.id,
            subject: conversation.subject,
            status: conversation.status,
          }
        : null,
      customer_name: conversation?.profiles?.full_name ?? null,
    };
  });
}
