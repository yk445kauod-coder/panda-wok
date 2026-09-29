import Link from "next/link";
import { Star } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { countFeedbackAdmin, listFeedbackAdmin } from "@/lib/services/admin-catalog";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  DEFAULT_PAGE_SIZE,
  Pagination,
  resolvePage,
} from "@/components/ui/pagination";
import { FeedbackReplyControl, FeedbackPublishControl } from "@/components/admin/customer-controls";
import { cn, formatDateTime } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type FeedbackStatus = Database["public"]["Enums"]["feedback_status"];
type FeedbackCategory = Database["public"]["Enums"]["feedback_category"];

const STATUSES: FeedbackStatus[] = ["new", "reviewed", "responded", "resolved", "archived"];
const CATEGORIES: FeedbackCategory[] = ["food_quality", "delivery", "service", "overall", "other"];

/**
 * Feedback inbox. Filters are server-driven so a link is shareable. Customer
 * contact details stay on this authenticated page only.
 */
export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; q?: string; page?: string }>;
}) {
  await requireCapability("feedback.manage");
  const params = await searchParams;
  const t = await getT(await getAdminLocale());

  const status = STATUSES.includes(params.status as FeedbackStatus)
    ? (params.status as FeedbackStatus)
    : undefined;
  const category = CATEGORIES.includes(params.category as FeedbackCategory)
    ? (params.category as FeedbackCategory)
    : undefined;

  const page = resolvePage(params.page);
  const pageSize = DEFAULT_PAGE_SIZE;
  const filter = { status, category, search: params.q };

  const [feedback, total] = await Promise.all([
    listFeedbackAdmin({
      ...filter,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    countFeedbackAdmin(filter),
  ]);

  const average =
    feedback.length > 0
      ? feedback.reduce((sum, row) => sum + row.rating, 0) / feedback.length
      : 0;
  const open = feedback.filter((row) => row.status === "new" || row.status === "reviewed").length;

  const buildHref = (next: { status?: string; category?: string }) => {
    const search = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextCategory = next.category ?? category;
    if (nextStatus) search.set("status", nextStatus);
    if (nextCategory) search.set("category", nextCategory);
    if (params.q) search.set("q", params.q);
    const query = search.toString();
    return `/admin/feedback${query ? `?${query}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("admin.pages.feedback.eyebrow")}
        title={t("admin.pages.feedback.title")}
        description={t("admin.pages.feedback.description")}
        actions={
          <>
            <Badge tone="neutral">{t("admin.pages.feedback.total", { count: total })}</Badge>
            {feedback.length > 0 ? (
              <Badge tone="info">
                <Star className="me-1 size-3" aria-hidden="true" />
                {t("admin.pages.feedback.average", { value: average.toFixed(1) })}
              </Badge>
            ) : null}
            {open > 0 ? (
              <Badge tone="warning">{t("admin.pages.feedback.needingReply", { count: open })}</Badge>
            ) : (
              <Badge tone="success">{t("admin.pages.feedback.allAnswered")}</Badge>
            )}
          </>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="feedback-q" className="block text-xs font-medium text-ink-800">
            {t("admin.pages.feedback.searchLabel")}
          </label>
          <input
            id="feedback-q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder={t("admin.pages.feedback.searchPlaceholder")}
            className="mt-1 h-10 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        </div>
        <div>
          <label htmlFor="feedback-status" className="block text-xs font-medium text-ink-800">
            {t("admin.pages.feedback.statusLabel")}
          </label>
          <select
            id="feedback-status"
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 h-10 rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="">{t("admin.pages.feedback.allStatuses")}</option>
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {t(`admin.term.feedbackStatus.${option}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="feedback-category" className="block text-xs font-medium text-ink-800">
            {t("admin.pages.feedback.categoryLabel")}
          </label>
          <select
            id="feedback-category"
            name="category"
            defaultValue={category ?? ""}
            className="mt-1 h-10 rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="">{t("admin.pages.feedback.allCategories")}</option>
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {t(`admin.term.feedbackCategory.${option}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-xl bg-vermilion-600 px-4 text-sm font-medium text-rice-50 hover:bg-vermilion-700"
        >
          {t("admin.pages.feedback.filter")}
        </button>
        {params.q || status || category ? (
          <Link
            href="/admin/feedback"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.feedback.clear")}
          </Link>
        ) : null}
      </form>

      <nav aria-label={t("admin.pages.feedback.quickFilters")} className="flex flex-wrap gap-2">
        {STATUSES.map((option) => (
          <Link
            key={option}
            href={buildHref({ status: status === option ? "" : option })}
            aria-current={status === option ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              status === option
                ? "border-vermilion-600 bg-vermilion-600 text-rice-50"
                : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
            )}
          >
            {t(`admin.term.feedbackStatus.${option}`)}
          </Link>
        ))}
      </nav>

      {feedback.length === 0 ? (
        <EmptyState
          title={
            params.q || status || category
              ? t("admin.pages.feedback.noMatch")
              : t("admin.pages.feedback.empty")
          }
          description={
            params.q || status || category
              ? t("admin.pages.feedback.noMatchBody")
              : t("admin.pages.feedback.emptyBody")
          }
        />
      ) : (
        <ul className="space-y-3">
          {feedback.map((row) => (
            <li key={row.id} className="washi-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 text-sm font-medium text-ink-900">
                      <Star className="size-3.5 text-miso-500" aria-hidden="true" />
                      {row.rating}/5
                    </span>
                    <Badge tone="neutral">
                      {t(`admin.term.feedbackCategory.${row.category}`)}
                    </Badge>
                    <Badge
                      tone={
                        row.status === "resolved" || row.status === "archived"
                          ? "success"
                          : row.status === "responded"
                            ? "info"
                            : "warning"
                      }
                    >
                      {t(`admin.term.feedbackStatus.${row.status}`)}
                    </Badge>
                    {row.order_id ? (
                      <Link href={`/admin/orders/${row.order_id}`}>
                        <Badge tone="info">{t("admin.pages.feedback.orderLinked")}</Badge>
                      </Link>
                    ) : null}
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-800/90">
                    {row.message}
                  </p>

                  {row.image_urls && row.image_urls.length > 0 ? (
                    <p className="mt-1.5 flex flex-wrap gap-2">
                      {row.image_urls.map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          className="text-xs font-medium text-vermilion-600 hover:text-vermilion-700"
                        >
                          {t("admin.pages.feedback.attachedImage", { n: index + 1 })}
                        </a>
                      ))}
                    </p>
                  ) : null}

                  {row.admin_response ? (
                    <div className="mt-3 rounded-xl border border-jade-500/25 bg-jade-500/8 p-2.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-jade-700">
                        {t("admin.pages.feedback.replied")}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-800">{row.admin_response}</p>
                      {row.responded_at ? (
                        <p className="mt-0.5 text-xs text-ink-700/60">
                          {formatDateTime(row.responded_at)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <p className="mt-2 text-xs text-ink-700/65">
                    {row.customer?.full_name ?? t("admin.pages.feedback.unnamedCustomer")}
                    {row.customer?.phone ? ` · ${row.customer.phone}` : ""}
                    {row.customer?.id ? (
                      <>
                        {" · "}
                        <Link
                          href={`/admin/crm/${row.customer.id}`}
                          className="text-vermilion-600 hover:text-vermilion-700"
                        >
                          {t("admin.pages.feedback.customerProfile")}
                        </Link>
                      </>
                    ) : null}
                    {" · "}
                    {formatDateTime(row.created_at)}
                  </p>

                  <FeedbackReplyControl
                    feedbackId={row.id}
                    currentStatus={row.status}
                    existingResponse={row.admin_response}
                  />

                  {row.order_id ? (
                    <FeedbackPublishControl
                      feedbackId={row.id}
                      isPublic={row.is_public}
                    />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath="/admin/feedback"
        searchParams={{ status, category, q: params.q }}
      />
    </div>
  );
}
