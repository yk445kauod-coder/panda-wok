"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, FileText, FileType, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportDeliverableAction, runDeliverableAction } from "@/lib/actions/agent";
import { useErrorText, useT } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/utils/format";

/** The file formats a document can be delivered as, and their button labels. */
const EXPORT_FORMATS = ["xlsx", "docx", "pdf"] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type DeliverableOption = {
  kind: string;
  label: string;
  description: string;
};

export type DeliverableRow = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  format: string;
  status: string;
  bytes: number | null;
  row_count: number | null;
  error: string | null;
  created_at: string;
};

/**
 * The deliverables panel: generate and download the agent's documents.
 *
 * Each button produces one real file (a sales sheet, a menu-engineering report,
 * a reorder CSV) and stores it. The downloads are short-lived signed URLs minted
 * on the server at render time — the browser never sees a storage path.
 */
export function AgentDeliverables({
  options,
  artifacts,
  downloadUrls,
}: {
  options: DeliverableOption[];
  artifacts: DeliverableRow[];
  downloadUrls: Record<string, string>;
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const t = useT();
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const [pendingExport, setPendingExport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(kind: string) {
    setPendingKind(kind);
    setError(null);
    const formData = new FormData();
    formData.set("kind", kind);
    try {
      const result = await runDeliverableAction(formData);
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      router.refresh();
    } catch {
      setError(t("admin.agent.deliverables.serverNoResponse"));
    } finally {
      setPendingKind(null);
    }
  }

  async function exportAs(kind: string, format: ExportFormat) {
    setPendingExport(`${kind}:${format}`);
    setError(null);
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("format", format);
    try {
      const result = await exportDeliverableAction(formData);
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      router.refresh();
    } catch {
      setError(t("admin.agent.deliverables.serverNoResponse"));
    } finally {
      setPendingExport(null);
    }
  }

  return (
    <section className="washi-panel p-4" aria-label={t("admin.agent.deliverables.title")}>
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
        <FileText className="size-4 text-jade-600" aria-hidden="true" />
        {t("admin.agent.deliverables.title")}
      </h2>
      <p className="mt-1 text-sm text-ink-700/75">
        {t("admin.agent.deliverables.subtitle")}
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <li key={option.kind} className="rounded-xl border border-ink-900/10 bg-rice-50 p-3">
            <p className="text-sm font-medium text-ink-900">{option.label}</p>
            <p className="mt-0.5 text-xs text-ink-700/70">{option.description}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2"
              loading={pendingKind === option.kind}
              onClick={() => generate(option.kind)}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              {t("admin.agent.deliverables.generate")}
            </Button>

            {/* The same document as a real file: Excel, Word or PDF. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink-700/70">
                {t("admin.agent.deliverables.asFile")}
              </span>
              {EXPORT_FORMATS.map((format) => {
                const Icon =
                  format === "xlsx" ? FileSpreadsheet : format === "docx" ? FileType : FileText;
                return (
                  <Button
                    key={format}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    loading={pendingExport === `${option.kind}:${format}`}
                    onClick={() => exportAs(option.kind, format)}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {format.toUpperCase()}
                  </Button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-chili-600">
          {error}
        </p>
      ) : null}

      <h3 className="mt-5 border-t border-ink-900/8 pt-4 text-sm font-semibold text-ink-900">
        {t("admin.agent.deliverables.generated")}
      </h3>

      {artifacts.length === 0 ? (
        <p className="mt-2 text-sm text-ink-700/70">
          {t("admin.agent.deliverables.empty")}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {artifacts.map((artifact) => {
            const href = artifact.status === "ready" ? downloadUrls[artifact.id] : undefined;
            return (
              <li
                key={artifact.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-rice-100/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{artifact.title}</p>
                  <p className="mt-0.5 text-xs text-ink-700/70">
                    {artifact.summary ?? ""}
                    {artifact.row_count != null ? ` · ${artifact.row_count} rows` : ""}
                    {artifact.bytes ? ` · ${(artifact.bytes / 1024).toFixed(1)} KB` : ""}
                    {` · ${formatDateTime(artifact.created_at)}`}
                  </p>
                  {artifact.error ? (
                    <p role="alert" className="mt-1 text-xs text-chili-600">
                      {artifact.error}
                    </p>
                  ) : null}
                </div>

                {artifact.status === "building" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-700/70">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    Building
                  </span>
                ) : href ? (
                  <a
                    href={href}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-vermilion-600 px-3 text-xs font-medium text-rice-50 hover:bg-vermilion-700"
                  >
                    <Download className="size-3.5" aria-hidden="true" />
                    Download
                  </a>
                ) : artifact.status === "failed" ? (
                  <span className="text-xs text-chili-600">Failed</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
