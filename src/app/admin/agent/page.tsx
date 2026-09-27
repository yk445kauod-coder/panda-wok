import { Bot, ShieldCheck, History } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import {
  getAgentSettings,
  listAgentActions,
  listAgentRuns,
  listAgentSkills,
  countAgentMemory,
  getAgentBaseUrl,
} from "@/lib/services/agent";
import { AgentControls } from "@/components/admin/agent-controls";
import { AgentActionCard } from "@/components/admin/agent-action-card";
import { AgentSkillsPanel } from "@/components/admin/agent-skills-panel";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

type ReportShape = {
  recommendations?: { title: string; detail: string; severity: string }[];
};

/**
 * The owner-facing ops agent console. It answers "how is the business doing, and
 * what needs doing" and turns that into a review queue. Nothing the agent
 * proposes is applied without an explicit human approval, so this page is safe to
 * leave running on a schedule.
 */
export default async function AdminAgentPage() {
  await requireCapability("ai.manage");

  const [settings, runs, actions, skills, memoryCount, baseUrl] = await Promise.all([
    getAgentSettings(),
    listAgentRuns(10),
    listAgentActions(60),
    listAgentSkills(),
    countAgentMemory(),
    getAgentBaseUrl(),
  ]);

  const pending = actions.filter((a) => a.status === "proposed");
  const approved = actions.filter((a) => a.status === "approved");
  const decided = actions.filter((a) => a.status !== "proposed" && a.status !== "approved");
  const lastRun = runs[0];
  const lastReport = (lastRun?.report ?? {}) as ReportShape;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-900">
            <Bot className="size-6 text-jade-600" aria-hidden="true" />
            Ops agent
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700/80">
            Watches orders, stock, customers and AI spend, then writes a report and
            proposes actions. It only observes and recommends — nothing reaches
            customers or the menu until you approve and apply it.
          </p>
        </div>
        <Badge tone={settings?.is_enabled ? "success" : "info"}>
          {settings?.is_enabled ? "Scheduled" : "Paused"}
        </Badge>
      </header>

      <AgentControls
        settings={{
          is_enabled: settings?.is_enabled ?? true,
          proposals_enabled: settings?.proposals_enabled ?? true,
          report_interval_hours: settings?.report_interval_hours ?? 24,
          backup_interval_hours: settings?.backup_interval_hours ?? 168,
        }}
      />

      <AgentSkillsPanel skills={skills} memoryCount={memoryCount} baseUrl={baseUrl} />

      <section className="washi-panel p-4" aria-label="Approval queue">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <ShieldCheck className="size-4 text-jade-600" aria-hidden="true" />
          Approval queue
          {pending.length > 0 ? (
            <span className="rounded-full bg-miso-500/20 px-2 py-0.5 text-xs font-medium text-miso-700">
              {pending.length}
            </span>
          ) : null}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          Approving records the decision; applying performs it. Broadcasts and gifted
          points reach real customers, so both steps are required.
        </p>

        {pending.length === 0 && approved.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No proposals yet"
              description="Run a report (or wait for the schedule) and the agent's suggestions will appear here for review."
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {[...pending, ...approved].map((action) => (
              <AgentActionCard
                key={action.id}
                action={{
                  id: action.id,
                  kind: action.kind,
                  title: action.title,
                  rationale: action.rationale,
                  payload: (action.payload ?? {}) as Record<string, unknown>,
                  status: action.status,
                  applied_ref: action.applied_ref,
                  error: action.error,
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="washi-panel p-4" aria-label="Run history">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
            <History className="size-4 text-jade-600" aria-hidden="true" />
            Recent runs
          </h2>
          {runs.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700/70">No runs recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {runs.map((run) => (
                <li key={run.id} className="rounded-lg bg-rice-100/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-900">
                      {run.headline ?? humanise(run.kind)}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-700/60">
                      {formatDateTime(run.started_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-700/70">
                    {humanise(run.trigger)} · {run.provider ?? "deterministic"} ·{" "}
                    {run.actions_proposed} proposed
                    {run.duration_ms ? ` · ${run.duration_ms}ms` : ""}
                  </p>
                  {run.error ? (
                    <p className="mt-1 text-xs text-chili-600">{run.error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="washi-panel p-4" aria-label="Latest report">
          <h2 className="font-display text-lg font-semibold text-ink-900">Latest report</h2>
          {!lastRun ? (
            <p className="mt-2 text-sm text-ink-700/70">
              Run a report to see the analysis here.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-sm text-ink-800">{lastRun.summary}</p>
              {lastReport.recommendations && lastReport.recommendations.length > 0 ? (
                <ul className="space-y-2">
                  {lastReport.recommendations.slice(0, 8).map((rec, index) => (
                    <li key={index} className="rounded-lg bg-rice-100/70 px-3 py-2">
                      <p className="text-sm font-medium text-ink-900">{rec.title}</p>
                      <p className="text-xs text-ink-700/75">{rec.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {decided.length > 0 ? (
        <section className="washi-panel p-4" aria-label="Decided actions">
          <h2 className="font-display text-lg font-semibold text-ink-900">History</h2>
          <ul className="mt-2 space-y-2">
            {decided.map((action) => (
              <AgentActionCard
                key={action.id}
                action={{
                  id: action.id,
                  kind: action.kind,
                  title: action.title,
                  rationale: action.rationale,
                  payload: (action.payload ?? {}) as Record<string, unknown>,
                  status: action.status,
                  applied_ref: action.applied_ref,
                  error: action.error,
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
