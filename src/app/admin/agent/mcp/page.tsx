import { Plug } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";
import { listMcpServers } from "@/lib/services/agent-ops";
import { McpServerManager } from "@/components/admin/mcp-server-manager";

export const dynamic = "force-dynamic";

export default async function AgentMcpPage() {
  await requireCapability("ai.manage");
  const t = await getT(await getLocale());
  const servers = await listMcpServers();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-900">
          <Plug className="size-6 text-jade-600" aria-hidden="true" />
          {t("admin.agent.mcpTitle")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-700/80">
          {t("admin.agent.mcpSubtitle")}
        </p>
      </header>
      <McpServerManager servers={servers} />
    </div>
  );
}
