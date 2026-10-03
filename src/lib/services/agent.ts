import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

/**
 * Reads for the ops agent console. RLS restricts all three tables to
 * owner/admin via `can_agent()`, so a scoped staff session simply sees nothing
 * rather than an error.
 */

export type OpsAgentSettings = Database["public"]["Tables"]["ops_agent_settings"]["Row"];
export type OpsAgentRun = Database["public"]["Tables"]["ops_agent_runs"]["Row"];
export type OpsAgentAction = Database["public"]["Tables"]["ops_agent_actions"]["Row"];

export async function getAgentSettings(): Promise<OpsAgentSettings | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ops_agent_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Failed to load agent settings: ${error.message}`);
  return data;
}

export async function listAgentRuns(limit = 20): Promise<OpsAgentRun[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ops_agent_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load agent runs: ${error.message}`);
  return data ?? [];
}

/** The approval queue, newest first, plus recently decided rows for context. */
export async function listAgentActions(limit = 50): Promise<OpsAgentAction[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ops_agent_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load agent actions: ${error.message}`);
  return data ?? [];
}

export type IndexedSkill = {
  name: string;
  source: string;
  source_url: string | null;
  chunks: number;
  updatedAt: string;
};

/**
 * What the agent currently knows, grouped by skill. Reads through RLS (owner and
 * admin only) and returns metadata only — never the indexed content, so the
 * console stays a control panel rather than a dump.
 */
export async function listAgentSkills(): Promise<IndexedSkill[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("agent_skills")
    .select("name, source, source_url, updated_at")
    .order("name");
  if (error) return [];

  const grouped = new Map<string, IndexedSkill>();
  for (const row of data ?? []) {
    const existing = grouped.get(row.name);
    if (existing) {
      existing.chunks += 1;
      if (row.updated_at > existing.updatedAt) existing.updatedAt = row.updated_at;
    } else {
      grouped.set(row.name, {
        name: row.name,
        source: row.source,
        source_url: row.source_url,
        chunks: 1,
        updatedAt: row.updated_at,
      });
    }
  }
  return [...grouped.values()];
}

/** A small count for the memory panel; the content itself is never listed. */
export async function countAgentMemory(): Promise<number> {
  const supabase = await createServerSupabase();
  const { count, error } = await supabase
    .from("agent_memory")
    .select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

/** The base URL the scheduler currently points at, if one has been set. */
export async function getAgentBaseUrl(): Promise<string> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "ops_agent.base_url")
    .maybeSingle();
  if (error || !data) return "";
  const value = data.value;
  return typeof value === "string" ? value : "";
}
