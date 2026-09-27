"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import {
  deleteAutomationAction,
  saveAutomationAction,
} from "@/lib/actions/agent-ops";
import type { AutomationView } from "@/lib/services/agent-ops";
import { useT } from "@/components/i18n-provider";
import { Field as FormField } from "@/components/admin/form-kit";
import { formatDateTime } from "@/lib/utils/format";

/** Automation list + editor — daily / weekly / monthly scheduled agent work. */

export function AutomationManager({ automations }: { automations: AutomationView[] }) {
  const t = useT();
  const [editing, setEditing] = useState<AutomationView | null>(null);
  const [cadence, setCadence] = useState<string>("daily");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await saveAutomationAction(formData);
      if (result.ok) {
        setEditing(null);
        setMessage(t("common.saved"));
      } else {
        setMessage(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <form action={submit} className="washi-panel space-y-3 p-4">
        <input type="hidden" name="id" value={editing?.id ?? ""} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="name" label={t("admin.automations.name")} defaultValue={editing?.name ?? ""} required />
          <FormField name="kind" label={t("admin.automations.kind")}>
            <select name="kind" defaultValue={editing?.kind ?? "report"} className="input">
              <option value="report">{t("admin.automations.kindReport")}</option>
              <option value="agent">{t("admin.automations.kindAgent")}</option>
              <option value="export">{t("admin.automations.kindExport")}</option>
            </select>
          </FormField>
          <FormField name="cadence" label={t("admin.automations.cadence")}>
            <select
              name="cadence"
              value={cadence}
              onChange={(event) => setCadence(event.target.value)}
              className="input"
            >
              <option value="daily">{t("admin.automations.daily")}</option>
              <option value="weekly">{t("admin.automations.weekly")}</option>
              <option value="monthly">{t("admin.automations.monthly")}</option>
              <option value="interval">{t("admin.automations.interval")}</option>
            </select>
          </FormField>
          <FormField
            name="atHour"
            label={t("admin.automations.atHour")}
            type="number"
            defaultValue={String(editing?.at_hour ?? 8)}
          />
          {cadence === "weekly" ? (
            <FormField name="weekday" label={t("admin.automations.weekday")} type="number" defaultValue={String(editing?.weekday ?? 1)} />
          ) : null}
          {cadence === "monthly" ? (
            <FormField name="dayOfMonth" label={t("admin.automations.dayOfMonth")} type="number" defaultValue={String(editing?.day_of_month ?? 1)} />
          ) : null}
          {cadence === "interval" ? (
            <FormField name="intervalHours" label={t("admin.automations.intervalHours")} type="number" defaultValue={String(editing?.interval_hours ?? 24)} />
          ) : null}
        </div>
        <FormField name="prompt" label={t("admin.automations.prompt")} defaultValue={editing?.prompt ?? ""} />
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-800">
            <input type="checkbox" name="isEnabled" defaultChecked={editing?.is_enabled ?? true} className="size-4" />
            {t("admin.automations.enabled")}
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-800">
            <input type="checkbox" name="notify" defaultChecked={editing?.notify ?? true} className="size-4" />
            {t("admin.automations.notify")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-vermilion-600 px-4 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {editing ? t("common.save") : t("admin.automations.add")}
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm text-ink-800"
            >
              {t("common.cancel")}
            </button>
          ) : null}
          {message ? <span className="text-sm text-ink-700">{message}</span> : null}
        </div>
      </form>

      <ul className="space-y-2">
        {automations.map((item) => (
          <li key={item.id} className="washi-panel flex flex-wrap items-center gap-3 p-3">
            <CalendarClock className="size-4 text-jade-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-900">{item.name}</p>
              <p className="text-xs text-ink-700/70">
                {t("admin.automations.nextRun")}: {formatDateTime(item.next_run_at)}
                {item.last_status ? ` · ${item.last_status}` : ""}
              </p>
              {item.last_error ? (
                <p className="text-xs text-vermilion-700">{item.last_error}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(item);
                setCadence(item.cadence);
              }}
              className="text-xs font-medium text-vermilion-600"
            >
              {t("common.edit")}
            </button>
            <DeleteAutomation id={item.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeleteAutomation({ id }: { id: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t("common.delete")}
      onClick={() => {
        const formData = new FormData();
        formData.set("id", id);
        startTransition(async () => {
          await deleteAutomationAction(formData);
        });
      }}
      className="text-vermilion-600"
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </button>
  );
}
