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
import { formatDateTime, formatNumber, humanise } from "@/lib/utils/format";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Datasets an operator can export. Each entry states its sensitivity so the
 * privacy obligation is visible before anyone clicks request.
 */
const DATASETS: DatasetOption[] = [
  {
    key: "orders",
    label: "Orders",
    description: "One row per order with totals, status and fulfilment.",
    sensitivity: "standard",
  },
  {
    key: "order_items",
    label: "Order items",
    description: "Line-level sales, useful for dish performance analysis.",
    sensitivity: "standard",
  },
  {
    key: "menu",
    label: "Menu",
    description: "Categories, dishes, prices and availability.",
    sensitivity: "standard",
  },
  {
    key: "stock",
    label: "Stock",
    description: "Ingredient levels and thresholds.",
    sensitivity: "standard",
  },
  {
    key: "feedback",
    label: "Feedback",
    description: "Ratings, comments and resolution status.",
    sensitivity: "personal",
  },
  {
    key: "loyalty",
    label: "Loyalty",
    description: "Point movements per account.",
    sensitivity: "personal",
  },
  {
    key: "users",
    label: "Users",
    description: "Customer profiles — names, phone numbers and spend.",
    sensitivity: "personal",
  },
  {
    key: "activity",
    label: "Activity logs",
    description: "Recorded customer actions with timestamps.",
    sensitivity: "personal",
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "Aggregated funnel and page events.",
    sensitivity: "standard",
  },
  {
    key: "ai_usage",
    label: "AI usage logs",
    description: "Provider, model, latency and token counts.",
    sensitivity: "standard",
  },
  {
    key: "segments",
    label: "CRM segments",
    description: "Distinct customers with order history, for segmentation.",
    sensitivity: "personal",
  },
];

/**
 * Export centre. Exports are recorded as jobs and built by the export worker;
 * the row count is computed at request time so the operator sees the size
 * before downloading anything.
 */
export default async function AdminExportsPage() {
  await requireCapability("exports.manage");

  const exports = await listExports(50);
  const personalCount = DATASETS.filter((dataset) => dataset.sensitivity === "personal").length;

  const downloadUrls = await getExportDownloadUrls(
    exports
      .filter((record) => record.status === "ready" && record.storage_path)
      .map((record) => record.storage_path as string),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Exports"
        description="Request a dataset in CSV or JSON. The file is built immediately and stored in the private exports bucket, then downloadable from the history below."
      />

      <section className="washi-panel p-4" aria-label="Request an export">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          Request an export
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {personalCount} of these datasets contain personal data. Exports are subject to
          your role&apos;s permissions and should be handled accordingly.
        </p>
        <div className="mt-4">
          <ExportRequestForm datasets={DATASETS} />
        </div>
      </section>

      <section aria-label="Export history">
        <h2 className="font-display text-lg font-semibold text-ink-900">History</h2>
        <p className="mt-1 text-sm text-ink-700/75">
          Every export request, newest first. Download links are signed and expire after an
          hour.
        </p>

        {exports.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No exports yet"
            description="Request a dataset above and it will be listed here with its size and status."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {exports.map((record) => {
              const href = record.storage_path
                ? downloadUrls[record.storage_path]
                : undefined;
              return (
                <li key={record.id} className="washi-panel p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
                        {humanise(record.dataset)}
                        <Badge tone="neutral">{record.format.toUpperCase()}</Badge>
                        <RunStatusBadge status={record.status} />
                      </p>
                      <p className="mt-0.5 text-xs text-ink-700/70">
                        {record.row_count !== null
                          ? `${formatNumber(record.row_count)} rows`
                          : "Row count pending"}
                        {record.bytes ? ` · ${(record.bytes / 1024).toFixed(1)} KB` : ""}
                        {" · requested "}
                        {formatDateTime(record.created_at)}
                        {record.completed_at
                          ? ` · completed ${formatDateTime(record.completed_at)}`
                          : ""}
                      </p>
                      {record.error ? (
                        <p role="alert" className="mt-1 text-xs text-chili-600">
                          {record.error}
                        </p>
                      ) : null}
                    </div>

                    {isRunInFlight(record.status) ? (
                      <Badge tone="info">Building…</Badge>
                    ) : href ? (
                      <a
                        href={href}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-vermilion-600 px-3 text-xs font-medium text-rice-50 hover:bg-vermilion-700"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                        Download
                      </a>
                    ) : record.status === "ready" ? (
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
