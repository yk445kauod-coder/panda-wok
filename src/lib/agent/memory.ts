import "server-only";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";
import { tryCreateAdminSupabase } from "@/lib/supabase/server";

/**
 * Durable vector memory.
 *
 * Facts worth keeping — an owner preference, a recurring customer request, the
 * rationale behind an applied action — are embedded and stored. Later they are
 * retrieved by cosine similarity and injected as a few lines, so the agent
 * recalls context without a growing prompt or a full history replay.
 *
 * Scoping is enforced in the database (`match_agent_memory`), not here: an owner
 * query only sees owner/system rows, and a customer query is pinned to that
 * customer's own id. This module never widens that.
 */

export type MemoryScope = "owner" | "customer" | "system";

export async function remember(params: {
  scope: MemoryScope;
  subjectId?: string | null;
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return null;

  const embedding = await embedText(params.content);
  const { data, error } = await admin.rpc("add_agent_memory", {
    p_scope: params.scope,
    // The SQL signature accepts null for an owner/system memory; the generated
    // types only see the non-null branch of the argument.
    p_subject_id: (params.subjectId ?? null) as unknown as string,
    p_kind: params.kind,
    p_content: params.content,
    p_metadata: (params.metadata ?? {}) as never,
    p_embedding: toVectorLiteral(embedding) as unknown as string,
  });
  if (error) return null;
  return data as string;
}

/**
 * Retrieval for a prompt. Returns a small, ranked list; with no embedding
 * service it returns nothing rather than guessing.
 */
export async function recall(params: {
  query: string;
  scope: MemoryScope;
  subjectId?: string | null;
  matchCount?: number;
}): Promise<{ kind: string; content: string; similarity: number }[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];

  const embedding = await embedText(params.query);
  if (!embedding) return [];

  const { data, error } = await admin.rpc("match_agent_memory", {
    p_query_embedding: toVectorLiteral(embedding) as unknown as string,
    p_scope: params.scope,
    p_subject_id: (params.subjectId ?? null) as unknown as string,
    p_match_count: Math.min(params.matchCount ?? 5, 10),
    p_min_similarity: 0.15,
  });
  if (error) return [];

  return (data ?? []).map((row) => ({
    kind: row.kind,
    content: row.content,
    similarity: Number(row.similarity),
  }));
}

/** Renders recalled memory for a prompt — a few lines, never the whole store. */
export function renderMemoryContext(
  memories: { kind: string; content: string }[],
): string {
  if (memories.length === 0) return "";
  return memories.map((m) => `- (${m.kind}) ${m.content}`).join("\n");
}
