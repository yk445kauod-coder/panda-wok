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
 *
 * Retrieval is *never* silently empty. When no embedding service is reachable
 * (`embedText` returns null) the vector RPC cannot run, so a lexical fallback
 * over recent rows answers instead. The failure mode being defended against is
 * the worst one for memory: a write that appears to succeed but can never be
 * read back.
 */

export type MemoryScope = "owner" | "customer" | "system";

export type MemoryHit = { kind: string; content: string; similarity: number };

/** Rows scanned by the lexical fallback. Small table, so a bounded scan is cheap. */
const LEXICAL_SCAN = 200;

/** Minimum length of a stored fact, so a bare "remember" is not saved. */
const MIN_FACT_CHARS = 6;

/** Normalises text for duplicate detection and lexical matching. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, "") // Arabic diacritics
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Token set, used by the lexical similarity fallback. */
function tokens(text: string): Set<string> {
  return new Set(normalise(text).split(" ").filter((t) => t.length > 1));
}

/**
 * Jaccard overlap in [0,1]. Deliberately crude: it only has to rank recent rows
 * well enough to beat "no recall at all" when embeddings are unavailable.
 */
export function lexicalSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

/** True when a very similar row already exists, so a re-save is a no-op. */
async function isDuplicate(
  admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>,
  scope: MemoryScope,
  subjectId: string | null,
  content: string,
): Promise<boolean> {
  const target = normalise(content);
  if (!target) return true;
  let query = admin
    .from("agent_memory")
    .select("content")
    .eq("scope", scope)
    .order("created_at", { ascending: false })
    .limit(50);
  query = subjectId ? query.eq("subject_id", subjectId) : query.is("subject_id", null);
  const { data } = await query;
  return (data ?? []).some((row) => normalise(row.content) === target);
}

export async function remember(params: {
  scope: MemoryScope;
  subjectId?: string | null;
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return null;

  const content = params.content.trim();
  if (!content) return null;

  // Idempotence: the same note stated twice must not become two memories.
  if (await isDuplicate(admin, params.scope, params.subjectId ?? null, content)) return null;

  const embedding = await embedText(content);
  const { data, error } = await admin.rpc("add_agent_memory", {
    p_scope: params.scope,
    // The SQL signature accepts null for an owner/system memory; the generated
    // types only see the non-null branch of the argument.
    p_subject_id: (params.subjectId ?? null) as unknown as string,
    p_kind: params.kind,
    p_content: content,
    p_metadata: (params.metadata ?? {}) as never,
    p_embedding: toVectorLiteral(embedding) as unknown as string,
  });
  if (error) return null;
  return data as string;
}

/** Lexical recall: recent rows ranked by token overlap. Used when embedding is down. */
async function recallLexical(params: {
  query: string;
  scope: MemoryScope;
  subjectId?: string | null;
  matchCount: number;
}): Promise<MemoryHit[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];

  let query = admin
    .from("agent_memory")
    .select("kind, content, subject_id, created_at")
    .eq("scope", params.scope)
    .order("created_at", { ascending: false })
    .limit(LEXICAL_SCAN);
  // Owner/system rows are shared; a customer row must match its own id.
  query = params.subjectId
    ? query.or(`subject_id.is.null,subject_id.eq.${params.subjectId}`)
    : query.is("subject_id", null);

  const { data, error } = await query;
  if (error) return [];

  return (data ?? [])
    .map((row) => ({
      kind: row.kind,
      content: row.content,
      similarity: lexicalSimilarity(params.query, row.content),
    }))
    .filter((row) => row.similarity > 0.02)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, params.matchCount);
}

/**
 * Retrieval for a prompt. Returns a small, ranked list. Prefers vector search;
 * falls back to lexical ranking when no embedding service is reachable, so the
 * agent always recalls *something* rather than nothing.
 */
export async function recall(params: {
  query: string;
  scope: MemoryScope;
  subjectId?: string | null;
  matchCount?: number;
}): Promise<MemoryHit[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];

  const matchCount = Math.min(params.matchCount ?? 5, 10);
  const embedding = await embedText(params.query);

  if (embedding) {
    const { data, error } = await admin.rpc("match_agent_memory", {
      p_query_embedding: toVectorLiteral(embedding) as unknown as string,
      p_scope: params.scope,
      p_subject_id: (params.subjectId ?? null) as unknown as string,
      p_match_count: matchCount,
      p_min_similarity: 0.15,
    });
    if (!error && data && data.length > 0) {
      return data.map((row) => ({
        kind: row.kind,
        content: row.content,
        similarity: Number(row.similarity),
      }));
    }
  }

  return recallLexical({
    query: params.query,
    scope: params.scope,
    subjectId: params.subjectId,
    matchCount,
  });
}

/** Renders recalled memory for a prompt — a few lines, never the whole store. */
export function renderMemoryContext(memories: { kind: string; content: string }[]): string {
  if (memories.length === 0) return "";
  return memories.map((m) => `- (${m.kind}) ${m.content}`).join("\n");
}

/** Metadata for the console: what is stored, never bulk content dumps. */
export type MemoryRow = {
  id: string;
  scope: string;
  kind: string;
  content: string;
  createdAt: string;
  hasEmbedding: boolean;
};

export async function listAgentMemory(limit = 50): Promise<MemoryRow[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  const { data, error } = await admin
    .from("agent_memory")
    .select("id, scope, kind, content, created_at, has_embedding")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    scope: row.scope,
    kind: row.kind,
    content: row.content,
    createdAt: row.created_at,
    // The generated column, so the 1024-float vector never reaches the browser.
    hasEmbedding: Boolean(row.has_embedding),
  }));
}

export async function deleteAgentMemory(id: string): Promise<boolean> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return false;
  const { error } = await admin.from("agent_memory").delete().eq("id", id);
  return !error;
}

/**
 * Backfills embeddings for rows written while no embedding service was reachable
 * (they are stored, but unreadable by vector search). Returns how many were
 * embedded. Safe to run repeatedly.
 */
export async function backfillMemoryEmbeddings(limit = 100): Promise<number> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return 0;
  const { data } = await admin
    .from("agent_memory")
    .select("id, content")
    .is("embedding", null)
    .limit(Math.min(limit, 200));
  if (!data || data.length === 0) return 0;

  let updated = 0;
  for (const row of data) {
    const embedding = await embedText(row.content);
    if (!embedding) break; // no service: stop rather than spin
    const { error } = await admin
      .from("agent_memory")
      .update({ embedding: toVectorLiteral(embedding) })
      .eq("id", row.id);
    if (!error) updated += 1;
  }
  return updated;
}

/* ------------------------------------------------------- automatic capture */

/** Markers that mean "keep this": an explicit instruction to remember. */
const REMEMBER_PATTERNS: RegExp[] = [
  /اف(?:تكر|اكر|هم)/, // افتكر / افتهم
  /خد بالك/,
  /خلي بالك/,
  /على فكرة/,
  /سجل(?:ها|ه|و)?\b/,
  /ملاحظة\s*:/,
  /remember\b/i,
  /note that\b/i,
  /keep in mind\b/i,
  /my preference\b/i,
  /always\b/i,
  /never\b/i,
];

/**
 * Extracts durable memories from a completed turn.
 *
 * Only two shapes qualify, deliberately: an explicit "remember this" instruction
 * from the owner, and the user's own stated preference. Everything else is left
 * alone — auto-storing every turn would bury the signal the agent needs, which is
 * exactly the failure the "few relevant lines" budget exists to prevent.
 */
export function extractMemoryCandidates(question: string): { kind: string; content: string }[] {
  const text = question.trim();
  if (text.length < 6) return [];
  if (!REMEMBER_PATTERNS.some((re) => re.test(text))) return [];

  // Strip a leading instruction so the memory reads as the fact, not the ask.
  const content = text
    .replace(/^(?:من فضلك|لو سمحت|please)?\s*(?:افتكر|افهم|خد بالك|خلي بالك|سجل|remember|note that|keep in mind)\s*(?:إن|ان|that)?\s*/i, "")
    .replace(/^(?:my preference is|my preference)\s*:?\s*/i, "")
    .trim();
  // A bare instruction ("remember", "always") is not a fact worth storing.
  if (content.length < MIN_FACT_CHARS) return [];
  return [{ kind: "owner_note", content: content.slice(0, 800) }];
}

/**
 * Long-term capture for a completed chat turn. Best-effort: a memory failure
 * must never fail the answer the operator is waiting on.
 */
export async function captureTurnMemory(params: {
  question: string;
  answer: string;
  actorId: string | null;
}): Promise<number> {
  const candidates = extractMemoryCandidates(params.question);
  if (candidates.length === 0) return 0;

  let saved = 0;
  for (const candidate of candidates) {
    const id = await remember({
      scope: "owner",
      kind: candidate.kind,
      content: candidate.content,
      metadata: { actorId: params.actorId, source: "chat" },
    }).catch(() => null);
    if (id) saved += 1;
  }
  return saved;
}
