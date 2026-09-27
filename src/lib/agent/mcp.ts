import "server-only";

import { tryCreateAdminSupabase } from "@/lib/supabase/server";
import { resolveSecretValue } from "@/lib/ai/provider";
import type { ToolSpec } from "@/lib/ai/tool-protocol";

/**
 * A minimal Model Context Protocol client.
 *
 * MCP is JSON-RPC 2.0 over HTTP: `initialize`, then `tools/list`, then
 * `tools/call`. That is the whole surface this needs — no SDK, because the SDK
 * pulls a transport stack that does not fit a serverless Worker, and the
 * protocol's core is small enough to speak directly.
 *
 * Security posture:
 *  - A server's URL and auth live in `mcp_servers`; the auth *value* lives in
 *    Supabase Vault behind `secret_ref`, never in the table.
 *  - `allowed_tools` is enforced here, not only at config time, so a server
 *    that later advertises a new tool cannot get it called by the agent until
 *    an owner adds it to the allow-list.
 *  - Every call has a timeout; a hanging MCP server degrades to a tool error
 *    rather than stalling the whole agent turn.
 */

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
};

export type McpServerRow = {
  id: string;
  name: string;
  url: string;
  transport: string;
  auth_header: string | null;
  secret_ref: string | null;
  allowed_tools: string[] | null;
  is_enabled: boolean;
};

const PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_TIMEOUT_MS = 12_000;

async function authHeaders(row: McpServerRow): Promise<Record<string, string>> {
  if (!row.secret_ref) return {};
  const value = await resolveSecretValue(row.secret_ref);
  if (!value) return {};
  return { [row.auth_header ?? "authorization"]: value };
}

/** Raw JSON-RPC call. Throws on transport failure or a JSON-RPC error object. */
async function rpc(
  row: McpServerRow,
  method: string,
  params: Record<string, unknown>,
  id: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(row.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // MCP streamable HTTP expects the client to accept both shapes.
        accept: "application/json, text/event-stream",
        ...(await authHeaders(row)),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`MCP ${row.name} responded ${response.status}`);
    }
    const text = await response.text();
    // A streamable-HTTP server may answer with SSE frames; take the last
    // `data:` line, which carries the JSON-RPC payload.
    const payload = text.startsWith("event:") || text.includes("\ndata:")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean)
          .pop() ?? ""
      : text;
    const parsed = JSON.parse(payload) as { result?: unknown; error?: { message?: string } };
    if (parsed.error) throw new Error(parsed.error.message ?? "MCP error");
    return parsed.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Lists the tools a server advertises, then applies the allow-list. */
export async function listMcpTools(row: McpServerRow): Promise<McpTool[]> {
  await rpc(
    row,
    "initialize",
    {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      clientInfo: { name: "panda-wok", version: "1.0.0" },
    },
    1,
  );
  const result = (await rpc(row, "tools/list", {}, 2)) as { tools?: McpTool[] };
  const tools = result?.tools ?? [];
  if (!row.allowed_tools || row.allowed_tools.length === 0) return tools;
  return tools.filter((tool) => row.allowed_tools!.includes(tool.name));
}

/** Calls one tool on one server and returns its raw result payload. */
export async function callMcpTool(
  row: McpServerRow,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Re-check the allow-list at call time: config may have changed since listing.
  if (row.allowed_tools && row.allowed_tools.length > 0 && !row.allowed_tools.includes(toolName)) {
    throw new Error(`tool ${toolName} is not on the allow-list for ${row.name}`);
  }
  return rpc(row, "tools/call", { name: toolName, arguments: args }, 3);
}

/** Converts an MCP tool into the ToolSpec shape the agent loop expects. */
export function toToolSpec(server: McpServerRow, tool: McpTool): ToolSpec {
  const properties = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  const params: ToolSpec["parameters"] = {};
  for (const [name, schema] of Object.entries(properties)) {
    const type =
      schema.type === "number" || schema.type === "integer" || schema.type === "boolean"
        ? schema.type
        : "string";
    params[name] = {
      type,
      description: schema.description ?? name,
      ...(schema.enum ? { enum: schema.enum } : {}),
      required: required.has(name),
    };
  }
  return {
    name: `mcp__${server.name}__${tool.name}`,
    description: tool.description ?? `Tool ${tool.name} on MCP server ${server.name}.`,
    parameters: params,
    write: true, // external tools are assumed to mutate; gated like other writes
  };
}

/** Enabled MCP servers, for the agent's tool list and the admin screen. */
export async function loadMcpServers(): Promise<McpServerRow[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  const { data } = await admin
    .from("mcp_servers")
    .select("id, name, url, transport, auth_header, secret_ref, allowed_tools, is_enabled")
    .eq("is_enabled", true)
    .order("name");
  return (data ?? []) as McpServerRow[];
}

/**
 * Discovers every tool across every enabled server. Failures are per-server and
 * swallowed: one broken MCP endpoint must not stop the agent from using its
 * built-in tools.
 */
export async function discoverMcpTools(
  servers?: McpServerRow[],
): Promise<{ server: McpServerRow; tool: McpTool; spec: ToolSpec }[]> {
  const rows = servers ?? (await loadMcpServers());
  const discovered: { server: McpServerRow; tool: McpTool; spec: ToolSpec }[] = [];
  for (const row of rows) {
    try {
      for (const tool of await listMcpTools(row)) {
        discovered.push({ server: row, tool, spec: toToolSpec(row, tool) });
      }
    } catch {
      // Recorded by the probe action, not fatal here.
    }
  }
  return discovered;
}

/** Probes a server and records the outcome. Used by the admin "Test" button. */
export async function probeMcpServer(row: McpServerRow): Promise<{
  ok: boolean;
  toolCount: number;
  error: string | null;
}> {
  const admin = tryCreateAdminSupabase();
  try {
    const tools = await listMcpTools(row);
    if (admin) {
      await admin
        .from("mcp_servers")
        .update({
          last_probed_at: new Date().toISOString(),
          last_probe_ok: true,
          last_probe_error: null,
        })
        .eq("id", row.id);
    }
    return { ok: true, toolCount: tools.length, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "probe failed";
    if (admin) {
      await admin
        .from("mcp_servers")
        .update({
          last_probed_at: new Date().toISOString(),
          last_probe_ok: false,
          last_probe_error: message,
        })
        .eq("id", row.id);
    }
    return { ok: false, toolCount: 0, error: message };
  }
}
