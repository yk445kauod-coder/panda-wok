import { requireCapability } from "@/lib/auth/session";
import { listExports } from "@/lib/services/admin-catalog";
import { getExportDownloadUrls } from "@/lib/export/download";
import {
  ExportRequestForm,
  type DatasetOption,
} from "@/components/admin/export-request-form";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RunStatusBadge, isRunInFlight } from "@/components/admin/run-status";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

/** Sensitivity is the only data here that is not a translated string. */
const DATASET_SENSITIVITY: Record<string, "standard" | "personal"> = {
  orders: "standard",
  order_items: "standard",
  menu: "standard",
  stock: "standard",
  feedback: "personal",
  loyalty: "personal",
  users: "personal",
  activity: "personal",
  analytics: "standard",
  ai_usage: "standard",
  segments: "personal",
};

/**
 * Export centre. Exports are recorded as jobs and built by the export worker;
 * the row count is computed at request time so the operator sees the size
 * before downloading anything.
 */
export default async function AdminExportsPage() {
  await requireCapability("exports.manage");
  const t = await getT(await getAdminLocale());

  const exports = await listExports(50);
  const datasets: DatasetOption[] = Object.entries(DATASET_SENSITIVITY).map(
    ([key, sensitivity]) => ({
      key,
      label: t(`admin.pages.exports.dataset.${key}`),
      description: t(`admin.pages.exports.datasetDesc.${key}`),
      sensitivity,
    }),
  );
  const personalCount = datasets.filter((dataset) => dataset.sensitivity === "personal").length;

  // Files are local-first: a ready row carries its own bytes and is streamed by
  // `/admin/exports/<id>/download`. Rows written before that change still point
  // at object storage, so a signed URL is minted for them as a fallback.
  const legacyPaths = exports
    .filter((record) => record.status === "ready" && !record.content_encoding && record.storage_path)
    .map((record) => record.storage_path as string);
  const downloadUrls = await getExportDownloadUrls(legacyPaths);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("admin.pages.exports.eyebrow")}
        title={t("admin.pages.exports.title")}
        description={t("admin.pages.exports.description")}
      />

      <section
        className="washi-panel p-4"
        aria-label={t("admin.pages.exports.requestHeading")}
      >
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t("admin.pages.exports.requestHeading")}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {t("admin.pages.exports.personalNote", { count: personalCount })}
        </p>
        <div className="mt-4">
          <ExportRequestForm datasets={datasets} />
        </div>
      </section>

      <section aria-label={t("admin.pages.exports.history")}>
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t("admin.pages.exports.history")}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {t("admin.pages.exports.historyHint")}
        </p>

        {exports.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={t("admin.pages.exports.empty")}
            description={t("admin.pages.exports.emptyBody")}
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {exports.map((record) => {
              const href = record.content_encoding
                ? `/admin/exports/${record.id}/download`
                : record.storage_path
                  ? downloadUrls[record.storage_path]
                  : undefined;
              return (
                <li key={record.id} className="washi-panel p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
                        {t(`admin.pages.exports.dataset.${record.dataset}`)}
                        <Badge tone="neutral">{record.format.toUpperCase()}</Badge>
                        <RunStatusBadge status={record.status} />
                      </p>
                      <p className="mt-0.5 text-xs text-ink-700/70">
                        {record.row_count !== null
                          ? t("admin.pages.exports.rows", {
                              count: formatNumber(record.row_count),
                            })
                          : t("admin.pages.exports.rowsPending")}
                        {record.bytes ? ` · ${(record.bytes / 1024).toFixed(1)} KB` : ""}
                        {" · "}
                        {t("admin.pages.exports.requested", {
                          when: formatDateTime(record.created_at),
                        })}
                        {record.completed_at
                          ? ` · ${t("admin.pages.exports.completed", {
                              when: formatDateTime(record.completed_at),
                            })}`
                          : ""}
                      </p>
                      {record.error ? (
                        <p role="alert" className="mt-1 text-xs text-chili-600">
                          {record.error}
                        </p>
                      ) : null}
                    </div>

                    {isRunInFlight(record.status) ? (
                      <Badge tone="info">{t("admin.pages.exports.building")}</Badge>
                    ) : href ? (
                      <a
                        href={href}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-vermilion-600 px-3 text-xs font-medium text-rice-50 hover:bg-vermilion-700"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                        {t("admin.pages.exports.download")}
                      </a>
                    ) : record.status === "ready" ? (
                      <Badge tone="success">{t("admin.pages.exports.ready")}</Badge>
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
