import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { listActivity } from "@/lib/crm/customers";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, humanise, safeJson } from "@/lib/utils/format";
import { cn } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** The activity vocabulary recorded by the app, for the filter bar. */
const EVENTS = [
  "PAGE_VIEW",
  "MENU_VIEW",
  "ITEM_VIEW",
  "CART_ADD",
  "CART_REMOVE",
  "CHECKOUT_STARTED",
  "ORDER_CREATED",
  "ORDER_CANCELED",
  "FEEDBACK_SUBMITTED",
  "LOYALTY_REWARD_EARNED",
  "MESSAGE_RECEIVED",
  "MESSAGE_SENT",
  "ASSISTANT_USED",
  "LOGIN",
] as const;

/**
 * Customer activity log. Structured, searchable and filterable; the metadata
 * column is rendered as text so an operator can read what actually happened.
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; q?: string }>;
}) {
  await requireCapability("crm.view");
  const params = await searchParams;
  const t = await getT(await getAdminLocale());

  const events = await listActivity({
    event: params.event,
    search: params.q,
    limit: 200,
  });

  const byEvent = (() => {
    const counts: Record<string, number> = {};
    for (const entry of events) counts[entry.event] = (counts[entry.event] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {t("admin.pages.activity.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("admin.pages.activity.description")}
          </p>
        </div>
        <Link
          href="/admin/crm"
          className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
        >
          {t("admin.pages.activity.back")}
        </Link>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="activity-search" className="block text-xs font-medium text-ink-800">
            {t("admin.pages.activity.searchLabel")}
          </label>
          <input
            id="activity-search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder={t("admin.pages.activity.searchPlaceholder")}
            className="mt-1 h-10 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        </div>
        <div>
          <label htmlFor="activity-event" className="block text-xs font-medium text-ink-800">
            {t("admin.pages.activity.eventLabel")}
          </label>
          <select
            id="activity-event"
            name="event"
            defaultValue={params.event ?? ""}
            className="mt-1 h-10 rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="">{t("admin.pages.activity.allEvents")}</option>
            {EVENTS.map((event) => (
              <option key={event} value={event}>
                {t(`admin.term.activityEvent.${event}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-xl bg-vermilion-600 px-4 text-sm font-medium text-rice-50 hover:bg-vermilion-700"
        >
          {t("admin.pages.activity.filter")}
        </button>
        {params.q || params.event ? (
          <Link
            href="/admin/crm/activity"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.activity.clear")}
          </Link>
        ) : null}
      </form>

      {byEvent.length > 0 ? (
        <nav aria-label={t("admin.pages.activity.eventTypes")} className="flex flex-wrap gap-2">
          {byEvent.map(([event, count]) => (
            <Link
              key={event}
              href={`/admin/crm/activity?event=${event}`}
              aria-current={params.event === event ? "true" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                params.event === event
                  ? "border-vermilion-600 bg-vermilion-600 text-rice-50"
                  : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
              )}
            >
              {t(`admin.term.activityEvent.${event}`)}
              <span
                className={cn(
                  "tabular-nums",
                  params.event === event ? "text-rice-50/80" : "text-ink-700/60",
                )}
              >
                {count}
              </span>
            </Link>
          ))}
        </nav>
      ) : null}

      {events.length === 0 ? (
        <EmptyState
          title={
            params.q || params.event
              ? t("admin.pages.activity.noMatch")
              : t("admin.pages.activity.empty")
          }
          description={
            params.q || params.event
              ? t("admin.pages.activity.noMatchBody")
              : t("admin.pages.activity.emptyBody")
          }
        />
      ) : (
        <ul className="space-y-2">
          {events.map((entry) => {
            const metadata = safeJson<Record<string, unknown>>(entry.metadata, {});
            const detail = Object.entries(metadata)
              .filter(([, value]) => typeof value === "string" || typeof value === "number")
              .slice(0, 4)
              .map(([key, value]) => `${humanise(key)}: ${String(value)}`)
              .join(" · ");

            return (
              <li key={entry.id} className="washi-panel p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-ink-900">
                      <span className="font-medium">
                        {t(`admin.term.activityEvent.${entry.event}`)}
                      </span>
                      {entry.entity ? <Badge tone="neutral">{entry.entity}</Badge> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-700/75">
                      {entry.customer_name ? (
                        entry.user_id ? (
                          <Link
                            href={`/admin/crm/${entry.user_id}`}
                            className="text-vermilion-600 hover:text-vermilion-700"
                          >
                            {entry.customer_name}
                          </Link>
                        ) : (
                          entry.customer_name
                        )
                      ) : (
                        t("admin.pages.activity.anonymous")
                      )}
                      {detail ? ` · ${detail}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-700/65">
                    {formatDateTime(entry.created_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
