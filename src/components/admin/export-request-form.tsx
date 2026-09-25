"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { AdminForm } from "@/components/admin/form-kit";
import { requestExportAction } from "@/lib/actions/admin";

export type DatasetOption = {
  key: string;
  label: string;
  description: string;
  /** Rows are counted at request time; null when the dataset is aggregated. */
  sensitivity: "standard" | "personal";
};

/**
 * Export requester. The dataset list is fixed and each entry states what it
 * contains, because an export of customer records carries privacy obligations.
 * The work runs in the background, so the success message sets expectations.
 */
export function ExportRequestForm({ datasets }: { datasets: DatasetOption[] }) {
  const [dataset, setDataset] = useState(datasets[0]?.key ?? "orders");
  const [format, setFormat] = useState<"csv" | "json">("csv");

  const selected = datasets.find((option) => option.key === dataset);

  return (
    <AdminForm
      action={requestExportAction}
      submitLabel="Request export"
      options={{
        successMessage:
          "Export queued. It appears below and turns ready when the worker finishes it.",
        resetOnSuccess: false,
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dataset" className="block text-sm font-medium text-ink-900">
            Dataset
          </label>
          <select
            id="dataset"
            name="dataset"
            value={dataset}
            onChange={(event) => setDataset(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            {datasets.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-ink-900">Format</legend>
          <input type="hidden" name="format" value={format} />
          <div className="mt-1.5 flex gap-2">
            {(["csv", "json"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFormat(option)}
                aria-pressed={format === option}
                className={
                  format === option
                    ? "h-11 flex-1 rounded-xl border border-indigo-600 bg-indigo-600/8 text-sm font-medium text-ink-900"
                    : "h-11 flex-1 rounded-xl border border-ink-900/12 bg-rice-50 text-sm text-ink-800 hover:bg-rice-100"
                }
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {selected ? (
        <p className="flex items-start gap-2 rounded-xl bg-rice-100/70 p-3 text-xs text-ink-700/80">
          <FileDown className="mt-0.5 size-3.5 shrink-0 text-indigo-600" aria-hidden="true" />
          <span>
            {selected.description}
            {selected.sensitivity === "personal" ? (
              <strong className="block pt-1 font-medium text-chili-600">
                Contains personal data. Only export what the task needs and delete the
                file afterwards.
              </strong>
            ) : null}
          </span>
        </p>
      ) : null}
    </AdminForm>
  );
}
