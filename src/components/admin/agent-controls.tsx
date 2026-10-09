"use client";

import { PlayCircle, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminForm, Field, Toggle, useAdminForm } from "@/components/admin/form-kit";
import { runAgentNowAction, saveAgentSettingsAction } from "@/lib/actions/agent";

type Settings = {
  is_enabled: boolean;
  proposals_enabled: boolean;
  report_interval_hours: number;
  backup_interval_hours: number;
};

/**
 * Cadence + run controls for the ops agent. "Run now" only observes and proposes;
 * it can never apply anything, so it is safe to press at any time.
 */
export function AgentControls({ settings }: { settings: Settings }) {
  const run = useAdminForm<{ runId: string }>(runAgentNowAction, {
    successMessage: "Report generated. Review the proposals below.",
  });

  return (
    <section className="washi-panel p-4" aria-label="Agent schedule">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
        <Settings2 className="size-4 text-jade-600" aria-hidden="true" />
        Schedule
      </h2>
      <p className="mt-1 text-sm text-ink-700/75">
        The agent observes on a schedule, writes a report and proposes actions. It
        never sends a broadcast or changes the menu on its own — every proposal waits
        for approval below.
      </p>

      <form onSubmit={run.submit} className="mt-3">
        <Button type="submit" size="sm" loading={run.pending}>
          <PlayCircle className="size-3.5" aria-hidden="true" />
          Run a report now
        </Button>
        {run.error ? <p className="mt-2 text-sm text-chili-600">{run.error}</p> : null}
        {run.done ? <p className="mt-2 text-sm text-jade-700">{run.done}</p> : null}
      </form>

      <AdminForm
        action={saveAgentSettingsAction}
        options={{ successMessage: "Schedule saved." }}
        className="mt-4 space-y-3 border-t border-ink-900/8 pt-4"
      >
        <Toggle
          name="isEnabled"
          label="Enable scheduled reports"
          defaultChecked={settings.is_enabled}
        />
        <Toggle
          name="proposalsEnabled"
          label="Allow the agent to propose actions"
          defaultChecked={settings.proposals_enabled}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            name="reportIntervalHours"
            label="Report interval (hours)"
            type="number"
            defaultValue={String(settings.report_interval_hours)}
            hint="24 = daily, 168 = weekly."
          />
          <Field
            name="backupIntervalHours"
            label="Backup interval (hours)"
            type="number"
            defaultValue={String(settings.backup_interval_hours)}
            hint="Weekly backups default to 168."
          />
        </div>
        <Button type="submit" size="sm">
          <Save className="size-3.5" aria-hidden="true" />
          Save schedule
        </Button>
      </AdminForm>
    </section>
  );
}
