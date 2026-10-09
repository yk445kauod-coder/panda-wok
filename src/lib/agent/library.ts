import "server-only";

import { createAdminSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";

/**
 * The team library: comments and reuse on the documents the agent produces.
 *
 * The documents themselves live in `agent_artifacts` and are readable by owners
 * and admins (`can_agent()`). This module adds the two things a shared library
 * needs on top of read/export — a discussion attached to a document, and a
 * record that it was reused — without widening who can see anything. Every
 * function here is reached from a server action that already checked
 * `ai.manage`, and the table's RLS policy checks `can_agent()` again.
 */

export type ArtifactComment = {
  id: string;
  artifactId: string;
  authorLabel: string | null;
  body: string;
  createdAt: string;
};

/** Comments for a set of documents, grouped by document id. */
export async function listArtifactComments(
  artifactIds: string[],
): Promise<Record<string, ArtifactComment[]>> {
  if (artifactIds.length === 0) return {};
  const admin = tryCreateAdminSupabase();
  if (!admin) return {};

  const { data, error } = await admin
    .from("agent_artifact_comments")
    .select("id, artifact_id, author_label, body, created_at")
    .in("artifact_id", artifactIds)
    .order("created_at", { ascending: true });
  if (error) return {};

  const grouped: Record<string, ArtifactComment[]> = {};
  for (const row of data ?? []) {
    (grouped[row.artifact_id] ??= []).push({
      id: row.id,
      artifactId: row.artifact_id,
      authorLabel: row.author_label,
      body: row.body,
      createdAt: row.created_at,
    });
  }
  return grouped;
}

/** Adds a comment. The author is recorded from the session, never the browser. */
export async function addArtifactComment(params: {
  artifactId: string;
  body: string;
  authorId: string | null;
  authorLabel: string | null;
}): Promise<string | null> {
  const body = params.body.trim();
  if (!body) return null;
  const admin = createAdminSupabase();

  // Confirm the document exists so a comment cannot be attached to a stray id.
  const { data: artifact } = await admin
    .from("agent_artifacts")
    .select("id")
    .eq("id", params.artifactId)
    .maybeSingle();
  if (!artifact) return null;

  const { data, error } = await admin
    .from("agent_artifact_comments")
    .insert({
      artifact_id: params.artifactId,
      author_id: params.authorId,
      author_label: params.authorLabel,
      body: body.slice(0, 4000),
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

/** Increments the reuse counter atomically and returns the new value. */
export async function markArtifactReused(id: string): Promise<number> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("mark_artifact_reused", { p_id: id });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
