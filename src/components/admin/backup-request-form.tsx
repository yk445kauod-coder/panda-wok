"use client";

import { useState } from "react";
import { AdminForm, Field, Toggle } from "@/components/admin/form-kit";
import { requestBackupAction } from "@/lib/actions/admin";

const KINDS: { key: string; label: string; hint: string }[] = [
  { key: "database", label: "Database", hint: "Core tables — the row-level backup." },
  { key: "configuration", label: "Configuration", hint: "Settings, flags and catalog config." },
  { key: "menu", label: "Menu", hint: "Categories, dishes and prices." },
  { key: "media_refs", label: "Media references", hint: "Pointers to stored images, not the files." },
  { key: "snapshot", label: "Full snapshot", hint: "Everything above in one manifest." },
];

/**
 * Backup requester. Creating a backup is safe and non-destructive; it still asks
 * for an explicit confirmation so a stray click cannot queue heavy work. The
 * action runs the real backup routine server-side.
 */
export function BackupRequestForm({
  kinds = KINDS,
}: {
  kinds?: { key: string; label: string; hint: string }[];
}) {
  const [kind, setKind] = useState(kinds[0]?.key ?? "database");
  const selected = kinds.find((item) => item.key === kind);

  return (
    <AdminForm
      action={requestBackupAction}
      submitLabel="Create backup"
      options={{
        successMessage: "Backup queued. Progress is shown in the history below.",
      }}
    >
      <div>
        <label htmlFor="kind" className="block text-sm font-medium text-ink-900">
          What to back up
        </label>
        <select
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        >
          {kinds.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        {selected ? (
          <p className="mt-1 text-xs text-ink-700/65">{selected.hint}</p>
        ) : null}
      </div>

      <Field
        name="label"
        label="Label (optional)"
        placeholder="Before the summer menu change"
        hint="A short note so future-you knows why this backup exists."
      />

      <Toggle
        name="confirm"
        label="I want to create this backup now"
        hint="Required. Backups read the whole dataset, so the server asks for intent."
      />
    </AdminForm>
  );
}
