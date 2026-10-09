import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import {
  getTagCounts,
  listCustomerTags,
  segmentOverview,
  SEGMENT_VALUE_LABELS,
} from "@/lib/crm/customers";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminSegmentsPage() {
  await requireCapability("crm.view");
  const locale = await getAdminLocale();
  const t = await getT(locale);

  const [segments, tags, tagCounts] = await Promise.all([
    segmentOverview(),
    listCustomerTags().catch(() => []),
    getTagCounts().catch(() => ({}) as Record<string, number>),
  ]);
  const totalAudience = segments.find((segment) => segment.segment === "all")?.count ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {t("admin.pages.segments.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("admin.pages.segments.description")}
          </p>
        </div>
        <Link
          href="/admin/crm"
          className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
        >
          {t("admin.pages.segments.back")}
        </Link>
      </header>

      {totalAudience === 0 ? (
        <EmptyState
          title={t("admin.pages.segments.empty")}
          description={t("admin.pages.segments.emptyBody")}
        />
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {segments.map((segment) => {
          const share = totalAudience > 0 ? (segment.count / totalAudience) * 100 : 0;
          return (
            <li key={segment.segment} className="washi-panel flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-ink-900">
                  {t(`admin.term.segment.${segment.segment}`)}
                </h2>
                <span className="shrink-0 font-display text-xl font-semibold tabular-nums text-ink-900">
                  {formatNumber(segment.count)}
                </span>
              </div>

              <p className="mt-1.5 flex-1 text-xs text-ink-700/75">
                {t(`admin.pages.segments.def.${segment.segment}`)}
              </p>

              {SEGMENT_VALUE_LABELS[segment.segment] ? (
                <p className="mt-1 text-xs text-miso-600">
                  {SEGMENT_VALUE_LABELS[segment.segment] === "Days since last order"
                    ? t("admin.pages.segments.valueDays")
                    : t("admin.pages.segments.valueSpend")}
                  :{" "}
                  {segment.segment === "inactive"
                    ? t("admin.pages.segments.days")
                    : t("admin.pages.segments.spend")}
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
                    {t("admin.pages.segments.ofCustomers", { value: share.toFixed(1) })}
                  </p>
                </div>
              ) : null}

              <Link
                href={`/admin/broadcast?segment=${segment.segment}`}
                className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-ink-900/15 text-xs font-medium text-ink-800 hover:bg-rice-200"
              >
                {t("admin.pages.segments.message")}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-ink-700/60">{t("admin.pages.segments.footnote")}</p>

      {tags.length > 0 ? (
        <section className="washi-panel p-4" aria-label={t("admin.pages.segments.tagsHeading")}>
          <h2 className="font-display text-base font-semibold text-ink-900">
            {t("admin.pages.segments.tagsHeading")}
          </h2>
          <p className="mt-1 text-xs text-ink-700/70">
            {t("admin.pages.segments.tagsHint")}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag.id}>
                <Badge tone={tag.tone as "neutral"}>
                  {locale === "ar" ? tag.label_ar : tag.label_en}
                  <span className="ms-1.5 tabular-nums opacity-80">
                    {formatNumber(tagCounts[tag.key] ?? 0)}
                  </span>
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
