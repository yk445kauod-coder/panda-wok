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
