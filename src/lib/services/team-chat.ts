import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";

export type TeamThread = {
  id: string;
  kind: "channel" | "dm";
  name: string;
  lastMessageAt: string;
  unread: number;
};

export type TeamMessage = {
  id: number;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
};

/**
 * The caller's threads, newest activity first. RLS already restricts this to
 * threads the caller belongs to (`team_threads_member_read`), so no extra
 * filter is needed for correctness; the join only supplies the unread count.
 */
export async function listMyTeamThreads(): Promise<TeamThread[]> {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return [];

  const { data, error } = await supabase
    .from("team_threads")
    .select("id, kind, name, last_message_at")
    .order("last_message_at", { ascending: false });

  if (error) return [];

  const { data: memberships } = await supabase
    .from("team_thread_members")
    .select("thread_id, last_read_at")
    .eq("user_id", me);

  const readAt = new Map(
    (memberships ?? []).map((m) => [m.thread_id, m.last_read_at]),
  );

  // Unread is computed per thread with a count query the RLS insert/select
  // policies already scope. Threads are few, so a per-thread count is fine here
  // and keeps the query readable.
  const threads: TeamThread[] = [];
  for (const thread of data ?? []) {
    const since = readAt.get(thread.id);
    let query = supabase
      .from("team_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id);
    if (since) query = query.gt("created_at", since);
    const { count } = await query;
    threads.push({
      id: thread.id,
      kind: thread.kind as "channel" | "dm",
      name: thread.name,
      lastMessageAt: thread.last_message_at,
      unread: count ?? 0,
    });
  }
  return threads;
}

/** A thread's messages with the sender's display name resolved. */
export async function getTeamThread(
  threadId: string,
  limit = 100,
): Promise<{ messages: TeamMessage[] } | null> {
  const supabase = await createServerSupabase();

  const { data: thread } = await supabase
    .from("team_threads")
    .select("id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return null;

  const { data: rows, error } = await supabase
    .from("team_messages")
    .select("id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return null;

  const senderIds = [...new Set((rows ?? []).map((r) => r.sender_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", senderIds as string[]);
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.full_name ?? "Team member");
    }
  }

  return {
    messages: (rows ?? []).map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_id ? names.get(row.sender_id) ?? "Team member" : "System",
      body: row.body,
      createdAt: row.created_at,
    })),
  };
}

/** Active staff other than the caller, for the "start a direct message" list. */
export async function listTeamPeers(): Promise<
  { userId: string; name: string; role: string }[]
> {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;

  const { data: staffRows } = await supabase
    .from("staff")
    .select("user_id, role, profiles:user_id (full_name)")
    .eq("is_active", true);

  return (staffRows ?? [])
    .filter((row) => row.user_id && row.user_id !== me)
    .map((row) => ({
      userId: row.user_id as string,
      name:
        (row.profiles as { full_name: string | null } | null)?.full_name ??
        String(row.role),
      role: String(row.role),
    }));
}
