import "server-only";

import { tryCreateAdminSupabase } from "@/lib/supabase/server";
import type { McpServerRow } from "@/lib/agent/mcp";

/** Admin-facing reads for the MCP and automation screens. */

export type McpServerView = McpServerRow & {
  created_at: string;
  last_probed_at: string | null;
  last_probe_ok: boolean | null;
  last_probe_error: string | null;
};

export async function listMcpServers(): Promise<McpServerView[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  const { data } = await admin
    .from("mcp_servers")
    .select(
      "id, name, url, transport, auth_header, secret_ref, allowed_tools, is_enabled, created_at, last_probed_at, last_probe_ok, last_probe_error",
    )
    .order("name");
  return (data ?? []) as McpServerView[];
}

export async function getMcpServer(id: string): Promise<McpServerView | null> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("mcp_servers")
    .select(
      "id, name, url, transport, auth_header, secret_ref, allowed_tools, is_enabled, created_at, last_probed_at, last_probe_ok, last_probe_error",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as McpServerView) ?? null;
}

export type AutomationView = {
  id: string;
  name: string;
  kind: "report" | "agent" | "export";
  prompt: string | null;
  cadence: "daily" | "weekly" | "monthly" | "interval";
  interval_hours: number | null;
  weekday: number | null;
  day_of_month: number | null;
  at_hour: number;
  is_enabled: boolean;
  notify: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
};

export async function listAutomations(): Promise<AutomationView[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  const { data } = await admin
    .from("agent_automations")
    .select(
      "id, name, kind, prompt, cadence, interval_hours, weekday, day_of_month, at_hour, is_enabled, notify, next_run_at, last_run_at, last_status, last_error",
    )
    .order("next_run_at");
  return (data ?? []) as AutomationView[];
}
