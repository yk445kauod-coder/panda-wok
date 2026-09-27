import "server-only";
import { embedText, embedTexts, toVectorLiteral } from "@/lib/ai/embeddings";
import { tryCreateAdminSupabase } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

/**
 * The agent's skill library.
 *
 * Skills are chunked into small units (a heading plus a handful of lines) at
 * sync time, so *retrieval* only ever pulls back the few chunks a task needs.
 * That is the whole point: the agent gets the relevant instructions without
 * reading — or paying for — the entire document. Nothing here ever returns a
 * whole file; the maximum context injected is `MAX_CHUNKS` chunks.
 *
 * Sources, in the order the product cares about:
 *   - repo AGENTS.md and skills.md (the project's own conventions)
 *   - Claude skill documents (`.claude/skills/*.md`, `SKILL.md`)
 *   - skills imported from a GitHub repository (fetched by URL, chunked here)
 */

export type SkillChunk = {
  heading: string | null;
  content: string;
  chunkIndex: number;
};

/** Lines per chunk. Deliberately tiny: the agent reads a few lines, not a file. */
const CHUNK_LINES = 12;
/** Hard ceiling on injected chunks, so a broad query can never flood context. */
const MAX_CHUNKS = 6;
/** Per-chunk character cap; a stray enormous paragraph is truncated, not loaded. */
const MAX_CHUNK_CHARS = 900;

/**
 * Splits a document into retrieval-sized chunks. It splits on markdown headings
 * first (so a chunk keeps its section title), then groups the following lines
 * into small windows. An over-long paragraph is truncated rather than split
 * mid-word, because a half-sentence is worse than a shortened one.
 */
export function chunkSkillDocument(markdown: string): SkillChunk[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const chunks: SkillChunk[] = [];

  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) {
      chunks.push({
        heading,
        content: content.slice(0, MAX_CHUNK_CHARS),
        chunkIndex: chunks.length,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    const isHeading = /^#{1,6}\s+/.test(line);
    if (isHeading) {
      flush();
      heading = line.replace(/^#{1,6}\s+/, "").trim();
      continue;
    }
    // Skip the large HTML comment blocks some skill docs use as scaffolding.
    if (/^\s*<!--/.test(line) || /^\s*-->/.test(line)) continue;

    buffer.push(line);
    if (buffer.length >= CHUNK_LINES) flush();
  }
  flush();

  return chunks;
}

type SourcedDocument = { name: string; source: string; sourceUrl: string | null; text: string };

/**
 * Indexes (or re-indexes) a document. Embeddings are computed in as few calls as
 * the provider allows; if embedding is unavailable the chunks are still stored,
 * so the skill is retrievable by name and can be re-embedded later.
 */
export async function indexSkillDocument(doc: SourcedDocument): Promise<number> {
  const admin = tryCreateAdminSupabase();
  if (!admin) throw new Error("Service role required to index skills.");

  const chunks = chunkSkillDocument(doc.text);
  if (chunks.length === 0) return 0;

  const embeddings = await embedTexts(chunks.map((c) => `${c.heading ?? ""}\n${c.content}`));

  const payload = chunks.map((chunk, index) => ({
    heading: chunk.heading,
    content: chunk.content,
    chunk_index: chunk.chunkIndex,
    embedding: toVectorLiteral(embeddings[index] ?? null),
  }));

  const { data, error } = await admin.rpc("replace_agent_skill", {
    p_name: doc.name,
    p_source: doc.source,
    p_source_url: doc.sourceUrl as unknown as string,
    p_chunks: payload as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? chunks.length);
}

/**
 * Retrieval. Returns at most MAX_CHUNKS small chunks — the "few lines when
 * needed" contract. With no embedding service the function returns nothing
 * rather than falling back to dumping a whole document.
 */
export async function retrieveSkills(
  query: string,
  matchCount = MAX_CHUNKS,
): Promise<{ name: string; heading: string | null; content: string; similarity: number }[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];

  const embedding = await embedText(query);
  if (!embedding) return [];

  const { data, error } = await admin.rpc("match_agent_skills", {
    p_query_embedding: toVectorLiteral(embedding) as unknown as string,
    p_match_count: Math.min(matchCount, MAX_CHUNKS),
    p_min_similarity: 0.1,
  });
  if (error) return [];

  return (data ?? []).map((row) => ({
    name: row.name,
    heading: row.heading,
    content: row.content,
    similarity: Number(row.similarity),
  }));
}

/**
 * Renders retrieved chunks for a prompt. Small and self-describing; it is the
 * only shape in which skill text reaches a model.
 */
export function renderSkillContext(
  chunks: { name: string; heading: string | null; content: string }[],
): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((c) => `[${c.name}${c.heading ? ` › ${c.heading}` : ""}]\n${c.content}`)
    .join("\n\n");
}

/** Lists which skills are indexed, for the console. Never returns content. */
export async function listIndexedSkills(): Promise<
  { name: string; source: string; sourceUrl: string | null; chunks: number; updatedAt: string }[]
> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];

  const { data, error } = await admin
    .from("agent_skills")
    .select("name, source, source_url, chunk_index, updated_at")
    .order("name");
  if (error) return [];

  const grouped = new Map<string, { name: string; source: string; sourceUrl: string | null; chunks: number; updatedAt: string }>();
  for (const row of data ?? []) {
    const existing = grouped.get(row.name);
    if (existing) {
      existing.chunks += 1;
      if (row.updated_at > existing.updatedAt) existing.updatedAt = row.updated_at;
    } else {
      grouped.set(row.name, {
        name: row.name,
        source: row.source,
        sourceUrl: row.source_url,
        chunks: 1,
        updatedAt: row.updated_at,
      });
    }
  }
  return [...grouped.values()];
}
