import { AlertTriangle, ShieldAlert } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { listBackups } from "@/lib/services/admin-catalog";
import { BackupRequestForm } from "@/components/admin/backup-request-form";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RunStatusBadge } from "@/components/admin/run-status";
import { formatDateTime, formatNumber, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/** Renders a manifest object as readable key/value lines without assuming shape. */
function manifestSummary(manifest: unknown): { label: string; value: string }[] {
  if (!manifest || typeof manifest !== "object") return [];
  const entries = Object.entries(manifest as Record<string, unknown>);

  return entries
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .slice(0, 6)
    .map(([key, value]) => ({
      label: humanise(key),
      value: typeof value === "number" ? formatNumber(value) : String(value),
    }));
}

/**
 * Backup centre. Creating a backup is safe; restoring is not, so restore is
 * deliberately not a button on this page — it is an authorised, out-of-band
 * operation documented here for the operator.
 */
export default async function AdminBackupsPage() {
  await requireCapability("backups.view");

  const backups = await listBackups(50);
  const last = backups[0] ?? null;
  const totalBytes = backups.reduce((sum, record) => sum + (record.bytes ?? 0), 0);
  const failed = backups.filter((record) => record.status === "failed").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Backups</h1>
        <p className="mt-1 text-sm text-ink-700/80">
          Snapshots of the database, configuration, menu and media references, each
          recorded with a manifest so you always know what a backup contains.
        </p>
      </header>

      <section aria-label="Backup status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Last backup"
          value={last ? formatDateTime(last.created_at) : "Never"}
          hint={last ? `${humanise(last.kind)} · ${humanise(last.status)}` : "No backup recorded"}
        />
        <Stat label="Backups kept" value={formatNumber(backups.length)} hint="In this history" />
        <Stat
          label="Total size"
          value={totalBytes > 0 ? `${(totalBytes / 1024).toFixed(1)} KB` : "—"}
          hint="Recorded manifest size"
        />
        <Stat
          label="Failed"
          value={formatNumber(failed)}
          hint={failed === 0 ? "None — good" : "Review the history below"}
          tone={failed > 0 ? "danger" : "neutral"}
        />
      </section>

      <section className="washi-panel p-4" aria-label="Create a backup">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          Create a backup
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          Choose what to capture and confirm. The job records a manifest immediately and
          completes server-side.
        </p>
        <div className="mt-4">
          <BackupRequestForm />
        </div>
      </section>

      <section
        className="washi-panel border-chili-500/25 bg-chili-500/5 p-4"
        aria-label="Restore safety"
      >
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <ShieldAlert className="size-4 text-chili-600" aria-hidden="true" />
          Restoring is a deliberate, authorised operation
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-800">
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-chili-500" aria-hidden="true" />
            There is intentionally no one-click restore. A restore overwrites live data.
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-chili-500" aria-hidden="true" />
            A restore requires the <code className="rounded bg-rice-200 px-1">backups.restore</code>{" "}
            permission, which is granted to owners only.
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-chili-500" aria-hidden="true" />
            It is performed out of band, against a named backup, with an explicit
            confirmation from the owner and a fresh pre-restore backup taken first.
          </li>
        </ul>
      </section>

      <section aria-label="Backup history">
        <h2 className="font-display text-lg font-semibold text-ink-900">History</h2>

        {backups.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No backups yet"
            description="Create your first backup above. It will appear here with its manifest and size."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {backups.map((record) => {
              const summary = manifestSummary(record.manifest);
              return (
                <li key={record.id} className="washi-panel p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
                        {humanise(record.kind)}
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
                          Manifest recorded. Detail available to the owner.
                        </p>
                      )}

                      {record.error ? (
                        <p role="alert" className="mt-1 text-xs text-chili-600">
                          {record.error}
                        </p>
                      ) : null}
                    </div>

                    {record.status === "ready" ? (
                      <Badge tone="success">Ready</Badge>
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
