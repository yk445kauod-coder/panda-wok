export type McpPreset = {
  id: string;
  name: string;
  vendor: string;
  url: string;
  transport: "http" | "sse";
  authHeader: string;
  /** Vault secret *name* the auth value is stored under. Never a value. */
  secretRef: string;
  /** Human description of which credential to paste, shown beside the field. */
  secretLabel: string;
  description: string;
  docsUrl: string;
  note: string;
  category: "marketing" | "engineering" | "data";
};

/**
 * Ready-to-configure MCP connectors.
 *
 * These are starting points, not installs: choosing one prefills the form with
 * a known endpoint and the exact secret name, but the owner still supplies the
 * credential and saves. Nothing connects until a human fills the token in.
 *
 * Endpoints are the vendors' own hosted servers, verified against their docs
 * (see each `docsUrl`). Where a vendor offers both OAuth and a token, the token
 * path is the one advertised here, because this client authenticates with a
 * bearer header and has no interactive OAuth flow.
 *
 * `secretRef` is a *name*, never a value. The value is written into Supabase
 * Vault through the AI centre's key save path and read back server-side; the
 * browser only ever sees the name.
 */
export const MCP_PRESETS: readonly McpPreset[] = [
  {
    id: "meta-ads",
    name: "Meta Ads",
    vendor: "Meta",
    url: "https://mcp.facebook.com/ads",
    transport: "http",
    authHeader: "authorization",
    secretRef: "META_ADS_ACCESS_TOKEN",
    secretLabel: "Meta app access token (ads_read, ads_management)",
    description:
      "Read campaign reporting and manage Facebook/Instagram ads through Meta's first-party ads server.",
    docsUrl: "https://developers.facebook.com/docs/marketing-apis",
    note: "Needs a Meta app access token with ads_read and ads_management. Read-write: the agent can pause or edit campaigns.",
    category: "marketing",
  },
  {
    id: "github",
    name: "GitHub",
    vendor: "GitHub",
    url: "https://api.githubcopilot.com/mcp/",
    transport: "http",
    authHeader: "authorization",
    secretRef: "GITHUB_MCP_PAT",
    secretLabel: "GitHub personal access token",
    description:
      "Repositories, issues, pull requests and code search through GitHub's hosted MCP server.",
    docsUrl: "https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server",
    note: "Use a fine-grained PAT sent as `Bearer <token>`. The hosted server's OAuth path needs a Copilot licence, so the token path is the one to use here.",
    category: "engineering",
  },
  {
    id: "supabase",
    name: "Supabase",
    vendor: "Supabase",
    url: "https://mcp.supabase.com/mcp?read_only=true",
    transport: "http",
    authHeader: "authorization",
    secretRef: "SUPABASE_MCP_TOKEN",
    secretLabel: "Supabase personal access token",
    description:
      "Query the project, inspect schema and run SQL through Supabase's hosted MCP server.",
    docsUrl: "https://supabase.com/docs/guides/getting-started/mcp",
    note: "Prefilled read-only. Append `&project_ref=<ref>` to scope it to one project; drop `read_only=true` only if you deliberately want the agent to write.",
    category: "data",
  },
] as const;

export function getMcpPreset(id: string): McpPreset | undefined {
  return MCP_PRESETS.find((preset) => preset.id === id);
}
