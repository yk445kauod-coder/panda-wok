import { AlertTriangle, Download, ShieldAlert } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { listBackups } from "@/lib/services/admin-catalog";
import { getBackupDownloadUrls } from "@/lib/backup/download";
import { BackupRequestForm } from "@/components/admin/backup-request-form";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RunStatusBadge } from "@/components/admin/run-status";
import { formatDateTime, formatNumber, humanise } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

/** Renders a manifest object as readable key/value lines without assuming shape. */
function manifestSummary(
  manifest: unknown,
  t: Translator,
): { label: string; value: string }[] {
  if (!manifest || typeof manifest !== "object") return [];
  const entries = Object.entries(manifest as Record<string, unknown>);

  return entries
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .slice(0, 6)
    .map(([key, value]) => {
      const key_ = `admin.pages.backups.manifest.${key}`;
      const label = t(key_);
      return {
        label: label === key_ ? humanise(key) : label,
        value: typeof value === "number" ? formatNumber(value) : String(value),
      };
    });
}

/**
 * Backup centre. Creating a backup is safe; restoring is not, so restore is
 * deliberately not a button on this page — it is an authorised, out-of-band
 * operation documented here for the operator.
 */
export default async function AdminBackupsPage() {
  await requireCapability("backups.view");
  const t = await getT(await getAdminLocale());

  const backups = await listBackups(50);
  const last = backups[0] ?? null;
  const totalBytes = backups.reduce((sum, record) => sum + (record.bytes ?? 0), 0);
  const failed = backups.filter((record) => record.status === "failed").length;

  const downloadUrls = await getBackupDownloadUrls(
    backups
      .filter((record) => record.status === "ready" && !record.content_encoding && record.storage_path)
      .map((record) => record.storage_path as string),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">
          {t("admin.pages.backups.title")}
        </h1>
        <p className="mt-1 text-sm text-ink-700/80">
          {t("admin.pages.backups.description")}
        </p>
      </header>

      <section
        aria-label={t("admin.pages.backups.title")}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Stat
          label={t("admin.pages.backups.lastBackup")}
          value={last ? formatDateTime(last.created_at) : t("admin.pages.backups.never")}
          hint={
            last
              ? `${t(`admin.pages.backups.kind.${last.kind}`)} · ${t(
                  `admin.term.runStatus.${last.status}`,
                )}`
              : t("admin.pages.backups.noBackup")
          }
        />
        <Stat
          label={t("admin.pages.backups.kept")}
          value={formatNumber(backups.length)}
          hint={t("admin.pages.backups.keptHint")}
        />
        <Stat
          label={t("admin.pages.backups.totalSize")}
          value={totalBytes > 0 ? `${(totalBytes / 1024).toFixed(1)} KB` : "—"}
          hint={t("admin.pages.backups.totalSizeHint")}
        />
        <Stat
          label={t("admin.pages.backups.failed")}
          value={formatNumber(failed)}
          hint={
            failed === 0
              ? t("admin.pages.backups.failedGood")
              : t("admin.pages.backups.failedBad")
          }
          tone={failed > 0 ? "danger" : "neutral"}
        />
      </section>

      <section
        className="washi-panel p-4"
        aria-label={t("admin.pages.backups.createHeading")}
      >
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t("admin.pages.backups.createHeading")}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {t("admin.pages.backups.createHint")}
        </p>
        <div className="mt-4">
          <BackupRequestForm />
        </div>
      </section>

      <section
        className="washi-panel border-chili-500/25 bg-chili-500/5 p-4"
        aria-label={t("admin.pages.backups.restoreSafety")}
      >
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <ShieldAlert className="size-4 text-chili-600" aria-hidden="true" />
          {t("admin.pages.backups.restoreHeading")}
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-800">
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-chili-500" aria-hidden="true" />
            {t("admin.pages.backups.restoreNoOneClick")}
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-chili-500" aria-hidden="true" />
            {t("admin.pages.backups.restorePermission")}
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-chili-500" aria-hidden="true" />
            {t("admin.pages.backups.restoreOutOfBand")}
          </li>
        </ul>
      </section>

      <section aria-label={t("admin.pages.backups.history")}>
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t("admin.pages.backups.history")}
        </h2>

        {backups.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={t("admin.pages.backups.empty")}
            description={t("admin.pages.backups.emptyBody")}
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {backups.map((record) => {
              const summary = manifestSummary(record.manifest, t);
              return (
                <li key={record.id} className="washi-panel p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
                        {t(`admin.pages.backups.kind.${record.kind}`)}
                        <RunStatusBadge status={record.status} />
                        {record.label ? (
                          <span className="text-xs text-ink-700/70">{record.label}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-700/70">
                        {formatDateTime(record.created_at)}
                        {record.bytes ? ` · ${(record.bytes / 1024).toFixed(1)} KB` : ""}
                      </p>

                      {summary.length > 0 ? (
                        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700/75">
                          {summary.map((entry) => (
                            <div key={entry.label} className="flex gap-1.5">
                              <dt>{entry.label}:</dt>
                              <dd className="tabular-nums text-ink-800">{entry.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="mt-1 text-xs text-ink-700/60">
                          {t("admin.pages.backups.manifestOwnerOnly")}
                        </p>
                      )}

                      {record.error ? (
                        <p role="alert" className="mt-1 text-xs text-chili-600">
                          {record.error}
                        </p>
                      ) : null}
                    </div>

                    {record.status === "ready" ? (
                      record.content_encoding ? (
                        <a
                          href={`/admin/backups/${record.id}/download`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-vermilion-600 px-3 text-xs font-medium text-rice-50 hover:bg-vermilion-700"
                        >
                          <Download className="size-3.5" aria-hidden="true" />
                          {t("admin.pages.backups.download")}
                        </a>
                      ) : downloadUrls[record.storage_path ?? ""] ? (
                        <a
                          href={downloadUrls[record.storage_path as string]}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-vermilion-600 px-3 text-xs font-medium text-rice-50 hover:bg-vermilion-700"
                        >
                          <Download className="size-3.5" aria-hidden="true" />
                          {t("admin.pages.backups.download")}
                        </a>
                      ) : (
                        <Badge tone="success">{t("admin.pages.backups.ready")}</Badge>
                      )
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="washi-panel p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/75">{label}</p>
      <p
        className={`mt-1 font-display text-lg font-semibold ${
          tone === "danger" ? "text-chili-600" : "text-ink-900"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-700/65">{hint}</p> : null}
    </div>
  );
}
