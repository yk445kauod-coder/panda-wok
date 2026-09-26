import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { segmentOverview, SEGMENT_LABELS, SEGMENT_VALUE_LABELS } from "@/lib/crm/customers";
import type { SegmentKey } from "@/lib/crm/customers";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * Plain-English definitions so an operator knows exactly who a segment
 * contains before sending anything to it.
 */
const DEFINITIONS: Record<SegmentKey, string> = {
  all: "Every registered customer who is not blocked.",
  opted_in: "Customers who explicitly agreed to marketing messages.",
  new: "Accounts created in the last 30 days.",
  loyal: "Customers with three or more completed orders.",
  inactive: "Customers whose most recent order is older than the threshold below.",
  never_ordered: "Accounts that have never placed an order.",
  high_value: "Customers whose lifetime spend meets the threshold below.",
  loyalty_members: "Customers currently holding a loyalty points balance.",
  winback: "Customers whose last order fell between 30 and 90 days ago.",
};

export default async function AdminSegmentsPage() {
  await requireCapability("crm.view");

  const segments = await segmentOverview();
  const totalAudience = segments.find((segment) => segment.segment === "all")?.count ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Segments</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Live audiences computed from orders, profiles and loyalty rows. Counts are
            recalculated on every load — nothing here is cached or estimated.
          </p>
        </div>
        <Link
          href="/admin/crm"
          className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
        >
          Back to CRM
        </Link>
      </header>

      {totalAudience === 0 ? (
        <EmptyState
          title="No customers to segment yet"
          description="Segments fill up as customers create accounts and place orders."
        />
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {segments.map((segment) => {
          const share = totalAudience > 0 ? (segment.count / totalAudience) * 100 : 0;
          return (
            <li key={segment.segment} className="washi-panel flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-ink-900">
                  {SEGMENT_LABELS[segment.segment]}
                </h2>
                <span className="shrink-0 font-display text-xl font-semibold tabular-nums text-ink-900">
                  {formatNumber(segment.count)}
                </span>
              </div>

              <p className="mt-1.5 flex-1 text-xs text-ink-700/75">
                {DEFINITIONS[segment.segment]}
              </p>

              {SEGMENT_VALUE_LABELS[segment.segment] ? (
                <p className="mt-1 text-xs text-miso-600">
                  {SEGMENT_VALUE_LABELS[segment.segment]}:{" "}
                  {segment.segment === "inactive" ? "30 days" : "1,000 EGP"}
                </p>
              ) : null}

              {totalAudience > 0 ? (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-rice-200">
                    <div
                      className="h-full rounded-full bg-vermilion-500"
                      style={{ width: `${Math.max(1, share)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-ink-700/60">
                    {share.toFixed(1)}% of customers
                  </p>
                </div>
              ) : null}

              <Link
                href={`/admin/broadcast?segment=${segment.segment}`}
                className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-ink-900/15 text-xs font-medium text-ink-800 hover:bg-rice-200"
              >
                Message this segment
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-ink-700/60">
        Marketing reach is limited to customers who opted in where the channel is email or
        SMS. In-app messages reach anyone in the segment.
      </p>
    </div>
  );
}
