import { CalendarClock } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";
import { listAutomations } from "@/lib/services/agent-ops";
import { AutomationManager } from "@/components/admin/automation-manager";

export const dynamic = "force-dynamic";

export default async function AgentAutomationsPage() {
  await requireCapability("ai.manage");
  const t = await getT(await getLocale());
  const automations = await listAutomations();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-900">
          <CalendarClock className="size-6 text-jade-600" aria-hidden="true" />
          {t("admin.agent.automationsTitle")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-700/80">
          {t("admin.agent.automationsSubtitle")}
        </p>
      </header>
      <AutomationManager automations={automations} />
    </div>
  );
}
