import { requireCapability } from "@/lib/auth/session";
import { listBroadcasts } from "@/lib/services/admin-catalog";
import { segmentOverview, SEGMENT_VALUE_LABELS } from "@/lib/crm/customers";
import type { SegmentKey } from "@/lib/crm/customers";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RunStatusBadge, isRunInFlight } from "@/components/admin/run-status";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Default audience value per segment, matching the SQL defaults. */
const SEGMENT_DEFAULT_VALUE: Partial<Record<SegmentKey, number>> = {
  inactive: 30,
  high_value: 1000,
};

/**
 * Broadcast centre. Sending is deliberately review-then-confirm: the operator
 * sees the exact audience and count, and the server action rejects an
 * unconfirmed send. This is the guard against an accidental mass message.
 */
export default async function AdminBroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  await requireCapability("broadcast.manage");
  const params = await searchParams;
  const t = await getT(await getAdminLocale());

  const [segments, history] = await Promise.all([
    segmentOverview(),
    listBroadcasts(50),
  ]);

  const defaultSegment =
    segments.find((segment) => segment.segment === params.segment)?.segment ??
    segments[0]?.segment ??
    "all";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">
          {t("admin.pages.broadcast.title")}
        </h1>
        <p className="mt-1 text-sm text-ink-700/80">
          {t("admin.pages.broadcast.description")}
        </p>
      </header>

      <section
        className="washi-panel p-4"
        aria-label={t("admin.pages.broadcast.compose")}
      >
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t("admin.pages.broadcast.newBroadcast")}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {t("admin.pages.broadcast.countNote")}
        </p>

        <div className="mt-4">
          <BroadcastComposer
            defaultSegment={defaultSegment}
            defaultSegmentValue={SEGMENT_DEFAULT_VALUE[defaultSegment] ?? 30}
            segments={segments.map((segment) => ({
              key: segment.segment,
              label: t(`admin.term.segment.${segment.segment}`),
              count: segment.count,
              valueLabel: SEGMENT_VALUE_LABELS[segment.segment]
                ? segment.segment === "inactive"
                  ? t("admin.pages.segments.valueDays")
                  : t("admin.pages.segments.valueSpend")
                : undefined,
              defaultValue: SEGMENT_DEFAULT_VALUE[segment.segment] ?? 30,
            }))}
          />
        </div>
      </section>

      <section aria-label={t("admin.pages.broadcast.audienceSizes")}>
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t("admin.pages.broadcast.audienceSizes")}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {t("admin.pages.broadcast.audienceSizesHint")}
        </p>

        {segments.every((segment) => segment.count === 0) ? (
          <EmptyState
            className="mt-4"
            title={t("admin.pages.broadcast.empty")}
            description={t("admin.pages.broadcast.emptyBody")}
          />
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {segments.map((segment) => (
              <li key={segment.segment} className="washi-panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {t(`admin.term.segment.${segment.segment}`)}
                    </p>
                    {SEGMENT_VALUE_LABELS[segment.segment] ? (
                      <p className="text-xs text-ink-700/65">
                        {t("admin.pages.broadcast.threshold", {
                          label:
                            segment.segment === "inactive"
                              ? t("admin.pages.segments.valueDays")
                              : t("admin.pages.segments.valueSpend"),
                          value: SEGMENT_DEFAULT_VALUE[segment.segment] ?? 30,
                        })}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-display text-lg font-semibold tabular-nums text-ink-900">
                    {formatNumber(segment.count)}
                  </span>
                </div>
                <a
                  href={`/admin/broadcast?segment=${segment.segment}`}
                  className="mt-2 inline-block text-xs font-medium text-vermilion-600 hover:text-vermilion-700"
                >
                  {t("admin.pages.broadcast.composeFor")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t("admin.pages.broadcast.history")}>
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t("admin.pages.broadcast.history")}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {t("admin.pages.broadcast.historyHint")}
        </p>

        {history.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={t("admin.pages.broadcast.noHistory")}
            description={t("admin.pages.broadcast.noHistoryBody")}
          />
        ) : (
          <ul className="mt-3 space-y-3">
            {history.map((broadcast) => (
              <li key={broadcast.id} className="washi-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">
                        {broadcast.title}
                      </span>
                      <RunStatusBadge status={broadcast.status} />
                      <Badge tone="neutral">
                        {t(`admin.term.broadcastChannel.${broadcast.channel}`)}
                      </Badge>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-ink-800/85">
                      {broadcast.body}
                    </p>
                    <p className="mt-1.5 text-xs text-ink-700/65">
                      {broadcast.audience_label ??
                        t("admin.pages.broadcast.noAudience")}{" "}
                      ·{" "}
                      {t("admin.pages.broadcast.sentCount", {
                        count: formatNumber(broadcast.sent_count),
                      })}
                      {broadcast.failed_count > 0
                        ? ` · ${t("admin.pages.broadcast.failedCount", {
                            count: formatNumber(broadcast.failed_count),
                          })}`
                        : ""}
                      {broadcast.sent_at
                        ? ` · ${formatDateTime(broadcast.sent_at)}`
                        : ` · ${t("admin.pages.broadcast.created", {
                            when: formatDateTime(broadcast.created_at),
                          })}`}
                    </p>
                  </div>

                  {isRunInFlight(broadcast.status) ? (
                    <Badge tone="info">{t("admin.pages.broadcast.delivering")}</Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
