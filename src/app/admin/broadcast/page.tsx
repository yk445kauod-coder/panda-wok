import { requireCapability } from "@/lib/auth/session";
import { listBroadcasts } from "@/lib/services/admin-catalog";
import { segmentOverview, SEGMENT_VALUE_LABELS } from "@/lib/crm/customers";
import type { SegmentKey } from "@/lib/crm/customers";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RunStatusBadge, isRunInFlight } from "@/components/admin/run-status";
import { formatDateTime, formatNumber, humanise } from "@/lib/utils/format";

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
        <h1 className="text-2xl font-semibold text-ink-900">Broadcast</h1>
        <p className="mt-1 text-sm text-ink-700/80">
          Message a segment of customers. Nothing is sent until you review the audience
          and confirm.
        </p>
      </header>

      <section className="washi-panel p-4" aria-label="Compose a broadcast">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          New broadcast
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          The recipient count is resolved from live data at send time, so it may differ
          slightly from the estimate shown while composing.
        </p>

        <div className="mt-4">
          <BroadcastComposer
            defaultSegment={defaultSegment}
            defaultSegmentValue={SEGMENT_DEFAULT_VALUE[defaultSegment] ?? 30}
            segments={segments.map((segment) => ({
              key: segment.segment,
              label: segment.label,
              count: segment.count,
              valueLabel: SEGMENT_VALUE_LABELS[segment.segment],
              defaultValue: SEGMENT_DEFAULT_VALUE[segment.segment] ?? 30,
            }))}
          />
        </div>
      </section>

      <section aria-label="Audience sizes">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          Audience sizes
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          Live counts for every segment. These are the same numbers the composer shows.
        </p>

        {segments.every((segment) => segment.count === 0) ? (
          <EmptyState
            className="mt-4"
            title="No customers to segment yet"
            description="Segments fill up as customers create accounts and place orders. Nothing here is simulated."
          />
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {segments.map((segment) => (
              <li key={segment.segment} className="washi-panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {segment.label}
                    </p>
                    {SEGMENT_VALUE_LABELS[segment.segment] ? (
                      <p className="text-xs text-ink-700/65">
                        {SEGMENT_VALUE_LABELS[segment.segment]}:{" "}
                        {SEGMENT_DEFAULT_VALUE[segment.segment]}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-display text-lg font-semibold tabular-nums text-ink-900">
                    {formatNumber(segment.count)}
                  </span>
                </div>
                <a
                  href={`/admin/broadcast?segment=${segment.segment}`}
                  className="mt-2 inline-block text-xs font-medium text-plum-600 hover:text-plum-700"
                >
                  Compose for this segment
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Broadcast history">
        <h2 className="font-display text-lg font-semibold text-ink-900">History</h2>
        <p className="mt-1 text-sm text-ink-700/75">
          Every broadcast ever sent, with the audience it actually reached.
        </p>

        {history.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No broadcasts sent yet"
            description="Your first announcement will be recorded here with its audience and delivery counts."
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
                      <Badge tone="neutral">{humanise(broadcast.channel)}</Badge>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-ink-800/85">
                      {broadcast.body}
                    </p>
                    <p className="mt-1.5 text-xs text-ink-700/65">
                      {broadcast.audience_label ?? "Audience not recorded"} ·{" "}
                      {formatNumber(broadcast.sent_count)} sent
                      {broadcast.failed_count > 0
                        ? ` · ${formatNumber(broadcast.failed_count)} failed`
                        : ""}
                      {broadcast.sent_at
                        ? ` · ${formatDateTime(broadcast.sent_at)}`
                        : ` · created ${formatDateTime(broadcast.created_at)}`}
                    </p>
                  </div>

                  {isRunInFlight(broadcast.status) ? (
                    <Badge tone="info">Delivering…</Badge>
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
