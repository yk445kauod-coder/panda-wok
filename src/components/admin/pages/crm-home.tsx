"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CrmCustomer, CrmStats } from "@/lib/crm/customers";
import { Badge, Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { PageLoading } from "@/components/admin/page-states";
import { Pagination } from "@/components/ui/pagination";
import { useAdminData } from "@/lib/admin/client";
import { useT } from "@/components/i18n-provider";
import { formatDate, formatNumber, formatPrice } from "@/lib/utils/format";

/**
 * CRM home: who our customers are, how much they spend and whether they are
 * still active. The figures and rows arrive from `/api/admin/crm`, so this
 * component does the sorting and rendering in the browser.
 */
export function CrmHomePage() {
  const t = useT();
  const params = useSearchParams();
  const q = params.get("q") ?? undefined;
  const sort = params.get("sort") ?? "lifetime_value";
  const page = Number.parseInt(params.get("page") ?? "1", 10) || 1;

  const { data, loading } = useAdminData<{
    customers: CrmCustomer[];
    stats: CrmStats;
    total: number;
    page: number;
    pageSize: number;
  }>("/api/admin/crm", { q, page, sort });

  if (loading && !data) return <PageLoading />;
  const customers = data?.customers ?? [];
  const stats = data?.stats;
  const total = data?.total ?? customers.length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM"
        title={t("admin.pages.crm.title")}
        description={t("admin.pages.crm.description")}
        actions={
          <>
            <Link
              href="/admin/crm/segments"
              className="inline-flex h-11 items-center rounded-xl border border-ink-900/15 px-4 text-sm text-ink-800 hover:bg-rice-200"
            >
              {t("admin.pages.crm.segments")}
            </Link>

          </>
        }
      />

      <section aria-label={t("admin.pages.crm.summary")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.pages.crm.customers")} value={formatNumber(stats?.customer_count ?? 0)} />
        <StatCard label={t("admin.pages.crm.lifetime")} value={formatPrice(stats?.lifetime_value ?? 0)} tone="good" />
        <StatCard
          label={t("admin.pages.crm.repeat")}
          value={formatNumber(stats?.repeat_customers ?? 0)}
          hint={t("admin.pages.crm.repeatHint")}
        />
        <StatCard
          label={t("admin.pages.crm.risk")}
          value={formatNumber(stats?.at_risk_customers ?? 0)}
          hint={t("admin.pages.crm.riskHint")}
          tone={(stats?.at_risk_customers ?? 0) > 0 ? "warn" : "neutral"}
        />
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="crm-search" className="block text-xs font-medium text-ink-800">
            {t("admin.pages.crm.search")}
          </label>
          <input
            id="crm-search"
            name="q"
            defaultValue={q ?? ""}
            placeholder={t("admin.pages.crm.searchPlaceholder")}
            className="mt-1 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        </div>
        <div>
          <label htmlFor="crm-sort" className="block text-xs font-medium text-ink-800">
            {t("admin.pages.crm.sort")}
          </label>
          <select
            id="crm-sort"
            name="sort"
            defaultValue={sort}
            className="mt-1 h-11 rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="lifetime_value">{t("admin.pages.crm.totalSpend")}</option>
            <option value="orders">{t("admin.pages.crm.orderCount")}</option>
            <option value="recent">{t("admin.pages.crm.recent")}</option>
            <option value="at_risk">{t("admin.pages.crm.riskFirst")}</option>
          </select>
        </div>
        <Button type="submit" size="md">
          {t("admin.pages.crm.apply")}
        </Button>
        {q || params.get("sort") ? (
          <Link
            href="/admin/crm"
            className="inline-flex h-11 items-center rounded-xl border border-ink-900/15 px-4 text-sm text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.crm.clear")}
          </Link>
        ) : null}
      </form>

      {customers.length === 0 ? (
        <EmptyState
          title={q ? t("admin.pages.crm.emptySearch") : t("admin.pages.crm.empty")}
          description={q ? t("admin.pages.crm.emptySearchBody") : t("admin.pages.crm.emptyBody")}
        />
      ) : (
        <ul className="space-y-3">
          {customers.map((customer) => {
            const lapsed = (customer.days_since_last_order ?? 0) >= 30 && customer.order_count > 0;
            return (
              <li key={customer.user_id} className="washi-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/crm/${customer.user_id}`}
                        className="font-display text-base font-semibold text-ink-900 hover:text-vermilion-600"
                      >
                        {customer.full_name ?? "Unnamed customer"}
                      </Link>
                      {customer.is_blocked ? <Badge tone="danger">{t("admin.pages.crm.blocked")}</Badge> : null}
                      {lapsed ? <Badge tone="warning">{t("admin.pages.crm.lapsed")}</Badge> : null}
                      {customer.marketing_opt_in ? (
                        <Badge tone="info">{t("admin.pages.crm.optedIn")}</Badge>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-ink-800">
                      {customer.phone ?? t("admin.pages.crm.noPhone")}
                      {customer.email ? (
                        <span className="text-ink-700/65"> · {customer.email}</span>
                      ) : null}
                    </p>

                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-700/75">
                      <div className="flex gap-1.5">
                        <dt>{t("admin.pages.crm.orders")}:</dt>
                        <dd className="tabular-nums text-ink-800">{customer.order_count}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>{t("admin.pages.crm.spend")}:</dt>
                        <dd className="tabular-nums text-ink-800">
                          {formatPrice(customer.lifetime_value)}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>{t("admin.pages.crm.avgOrder")}:</dt>
                        <dd className="tabular-nums text-ink-800">
                          {formatPrice(customer.avg_order_value)}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>{t("admin.pages.crm.lastOrder")}:</dt>
                        <dd className="text-ink-800">
                          {customer.last_order_at
                            ? `${formatDate(customer.last_order_at)}${
                                customer.days_since_last_order !== null
                                  ? ` (${customer.days_since_last_order}d ago)`
                                  : ""
                              }`
                            : t("admin.pages.crm.never")}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>{t("admin.pages.crm.joined")}:</dt>
                        <dd className="text-ink-800">{formatDate(customer.created_at)}</dd>
                      </div>
                    </dl>

                    {customer.favorite_items && customer.favorite_items.length > 0 ? (
                      <p className="mt-1.5 text-xs text-ink-700/70">
                        {t("admin.pages.crm.usually")}: {customer.favorite_items.slice(0, 3).join(", ")}
                      </p>
                    ) : null}
                  </div>

                  <Link
                    href={`/admin/crm/${customer.user_id}`}
                    className="shrink-0 rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs font-medium text-ink-800 hover:bg-rice-200"
                  >
                    {t("admin.pages.crm.profile")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? 25}
        total={total}
        basePath="/admin/crm"
        searchParams={{ q, sort: params.get("sort") ?? undefined }}
      />
    </div>
  );
}
