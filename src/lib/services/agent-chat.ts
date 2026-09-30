import "server-only";

import { createAdminSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import type { AgentStep } from "@/lib/agent/conversation";

/**
 * Persistence for the admin ↔ agent conversation.
 *
 * The console unlocks with a passcode, so there is frequently no `auth.uid()`.
 * Threads therefore carry an explicit `owner_id` (the gate's resolved actor id)
 * and the service reads/writes through the service role, exactly as the
 * notifications and team-chat services do. The RLS policies on the tables are
 * the second gate for any future direct client access.
 */

export type AgentThread = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message: string | null;
  message_count: number;
};

export type AgentChatMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  body: string;
  steps: AgentStep[];
  provider: string | null;
  model: string | null;
  created_at: string;
};

/** Lists threads visible to an actor, newest first, with a preview. */
export async function listAgentThreads(
  ownerId: string | null,
  limit = 30,
): Promise<AgentThread[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  let query = admin
    .from("agent_threads")
    .select("id, title, created_at, updated_at, agent_messages(body, created_at)")
    .order("updated_at", { ascending: false })
    .limit(limit);
  // A passcode-only owner has no id; they see the shared (null-owner) threads.
  query = ownerId ? query.eq("owner_id", ownerId) : query.is("owner_id", null);

  const { data } = await query;
  return (data ?? []).map((row) => {
    const messages = (row.agent_messages ?? []) as { body: string; created_at: string }[];
    const latest = messages.sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
    return {
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_message: latest?.body ?? null,
      message_count: messages.length,
    };
  });
}

export async function getAgentThread(
  id: string,
  ownerId: string | null,
): Promise<{ id: string; title: string; messages: AgentChatMessage[] } | null> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return null;
  const { data: thread } = await admin
    .from("agent_threads")
    .select("id, title, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!thread) return null;
  if (thread.owner_id !== null && thread.owner_id !== ownerId) return null;

  const { data: messages } = await admin
    .from("agent_messages")
    .select("id, role, body, steps, provider, model, created_at")
    .eq("thread_id", id)
    .order("created_at");
  return {
    id: thread.id,
    title: thread.title,
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role as AgentChatMessage["role"],
      body: m.body,
      steps: (m.steps ?? []) as AgentStep[],
      provider: m.provider,
      model: m.model,
      created_at: m.created_at,
    })),
  };
}

/** Creates a thread for an actor and returns its id. */
export async function createAgentThread(params: {
  ownerId: string | null;
  ownerLabel?: string | null;
  title?: string;
}): Promise<string> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("agent_threads")
    .insert({
      owner_id: params.ownerId,
      owner_label: params.ownerLabel ?? null,
      title: params.title?.slice(0, 120) || "New conversation",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "could not create thread");
  return data.id;
}

/** Appends a message and bumps the thread's timestamp. */
export async function appendAgentMessage(params: {
  threadId: string;
  role: AgentChatMessage["role"];
  body: string;
  steps?: AgentStep[];
  provider?: string | null;
  model?: string | null;
}): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("agent_messages").insert({
    thread_id: params.threadId,
    role: params.role,
    body: params.body.slice(0, 20_000),
    steps: (params.steps ?? []) as never,
    provider: params.provider ?? null,
    model: params.model ?? null,
  });
  if (error) throw new Error(error.message);
  await admin
    .from("agent_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.threadId);
}

/** Renames a thread from its opening line, once, so the list stays readable. */
export async function titleThreadFromFirstMessage(
  threadId: string,
  firstMessage: string,
): Promise<void> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("agent_threads")
    .select("title, agent_messages(id)")
    .eq("id", threadId)
    .maybeSingle();
  if (!data || data.title !== "New conversation") return;
  const title = firstMessage.trim().slice(0, 80) || "New conversation";
  await admin.from("agent_threads").update({ title }).eq("id", threadId);
}

export async function deleteAgentThread(id: string, ownerId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("agent_threads")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  if (data.owner_id !== null && data.owner_id !== ownerId) return;
  await admin.from("agent_threads").delete().eq("id", id);
}

/** The most recent N messages, oldest first, for building model history. */
export async function recentAgentHistory(
  threadId: string,
  limit = 10,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  const { data } = await admin
    .from("agent_messages")
    .select("role, body")
    .eq("thread_id", threadId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.body }));
}

/** Verbatim turns kept in context; older turns are condensed into the summary. */
const RECENT_WINDOW = 12;
/** How many new old-turns trigger a summary refresh (avoids rebuilding every turn). */
const SUMMARY_REFRESH_AFTER = 4;
/** Char budget for the rolling summary, so it can never crowd the prompt. */
const SUMMARY_MAX_CHARS = 1600;

/**
 * Short-term memory for a thread that outgrows the recent window.
 *
 * A conversation used to be truncated to the last few messages, so a long
 * working session silently forgot how it started. Here the newest `window` turns
 * stay verbatim and everything older is folded into a rolling summary, which is
 * injected as a system line. The summary is built from the operator's *own
 * words* (the opening line of each older question), so it is a compaction of what
 * was actually said rather than a model's paraphrase that could invent detail.
 *
 * Deterministic and cheap on purpose: summarising must not cost a model call on
 * every turn, or the memory would slow the answer it exists to improve.
 */
export async function compactAgentHistory(
  threadId: string,
  opts: { window?: number } = {},
): Promise<{ summary: string | null; history: { role: "user" | "assistant" | "system"; content: string }[] }> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { summary: null, history: [] };
  const window = opts.window ?? RECENT_WINDOW;

  const { data: thread } = await admin
    .from("agent_threads")
    .select("summary, summary_upto")
    .eq("id", threadId)
    .maybeSingle();

  const { data } = await admin
    .from("agent_messages")
    .select("role, body, created_at")
    .eq("thread_id", threadId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });

  const all = data ?? [];
  if (all.length <= window) {
    return {
      summary: thread?.summary ?? null,
      history: all.map((m) => ({ role: m.role as "user" | "assistant", content: m.body })),
    };
  }

  const recent = all.slice(-window);
  const older = all.slice(0, -window);

  // Only the old-turns that the stored summary does not already cover.
  const cutoff = thread?.summary_upto ?? null;
  const uncovered = cutoff ? older.filter((m) => m.created_at > cutoff) : older;

  let summary = thread?.summary ?? null;
  let summaryUpto = cutoff;

  const shouldRefresh = !summary || uncovered.length >= SUMMARY_REFRESH_AFTER;
  if (shouldRefresh && older.length > 0) {
    const lines = older
      .filter((m) => m.role === "user")
      .map((m) => `- ${m.body.replace(/\s+/g, " ").slice(0, 140)}`);
    const header = "ملخص المحادثة السابقة (كلام المستخدم نفسه):";
    summary = `${header}\n${lines.join("\n")}`.slice(0, SUMMARY_MAX_CHARS);
    summaryUpto = older[older.length - 1].created_at;
    await admin
      .from("agent_threads")
      .update({ summary, summary_upto: summaryUpto })
      .eq("id", threadId);
  }

  const history: { role: "user" | "assistant" | "system"; content: string }[] = [];
  if (summary) history.push({ role: "system", content: summary });
  for (const m of recent) history.push({ role: m.role as "user" | "assistant", content: m.body });
  return { summary, history };
}
