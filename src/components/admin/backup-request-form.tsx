"use client";

import { useState } from "react";
import { AdminForm, Field, Toggle } from "@/components/admin/form-kit";
import { requestBackupAction } from "@/lib/actions/admin";
import { useT } from "@/components/i18n-provider";

const KINDS = ["database", "configuration", "menu", "media_refs", "snapshot"] as const;
type KindKey = (typeof KINDS)[number];

/**
 * Backup requester. Creating a backup is safe and non-destructive; it still asks
 * for an explicit confirmation so a stray click cannot queue heavy work. The
 * action runs the real backup routine server-side.
 */
export function BackupRequestForm({ kinds = KINDS }: { kinds?: readonly KindKey[] }) {
  const t = useT();
  const [kind, setKind] = useState<string>(kinds[0] ?? "database");
  const [format, setFormat] = useState<"json" | "xlsx" | "txt">("json");

  return (
    <AdminForm
      action={requestBackupAction}
      submitLabel={t("admin.pages.backups.form.submit")}
      options={{ successMessage: t("admin.pages.backups.form.success") }}
    >
      <div>
        <label htmlFor="kind" className="block text-sm font-medium text-ink-900">
          {t("admin.pages.backups.form.whatToBackUp")}
        </label>
        <select
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        >
          {kinds.map((option) => (
            <option key={option} value={option}>
              {t(`admin.pages.backups.kind.${option}`)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-700/65">
          {t(`admin.pages.backups.kindHint.${kind}`)}
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-900">
          {t("admin.pages.backups.form.format")}
        </legend>
        <input type="hidden" name="format" value={format} />
        <div className="mt-1.5 flex gap-2">
          {(["json", "xlsx", "txt"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFormat(option)}
              aria-pressed={format === option}
              className={
                format === option
                  ? "h-11 flex-1 rounded-xl border border-vermilion-600 bg-vermilion-600/8 text-sm font-medium text-ink-900"
                  : "h-11 flex-1 rounded-xl border border-ink-900/12 bg-rice-50 text-sm text-ink-800 hover:bg-rice-100"
              }
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-700/65">
          {t("admin.pages.backups.form.formatHint")}
        </p>
      </fieldset>

      <Field
        name="label"
        label={t("admin.pages.backups.form.label")}
        placeholder={t("admin.pages.backups.form.labelPlaceholder")}
        hint={t("admin.pages.backups.form.labelHint")}
      />

      <Toggle
        name="confirm"
        label={t("admin.pages.backups.form.confirmLabel")}
        hint={t("admin.pages.backups.form.confirmHint")}
      />
    </AdminForm>
  );
}
