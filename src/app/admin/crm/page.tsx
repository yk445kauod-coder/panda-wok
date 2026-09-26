import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { getCrmStats, listCrmCustomers } from "@/lib/crm/customers";
import { Badge, Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { formatDate, formatNumber, formatPrice, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * CRM home: who our customers are, how much they spend and whether they are
 * still active. Headline figures come from a whole-book SQL aggregate, not
 * from the rows on this page.
 */
export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  await requireCapability("crm.view");
  const params = await searchParams;

  const [customers, stats] = await Promise.all([
    listCrmCustomers({ search: params.q, limit: 100 }),
    getCrmStats(),
  ]);

  const sort = params.sort ?? "lifetime_value";
  const sorted = [...customers].sort((a, b) => {
    switch (sort) {
      case "orders":
        return b.order_count - a.order_count;
      case "recent":
        return (b.last_order_at ?? "").localeCompare(a.last_order_at ?? "");
      case "at_risk":
        return (b.days_since_last_order ?? -1) - (a.days_since_last_order ?? -1);
      default:
        return b.lifetime_value - a.lifetime_value;
    }
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM"
        title="Customers"
        description="Every customer with their real order history, spend and engagement. Figures come from orders and loyalty rows, never estimates."
        actions={
          <>
            <Link
              href="/admin/crm/segments"
              className="inline-flex h-11 items-center rounded-xl border border-ink-900/15 px-4 text-sm text-ink-800 hover:bg-rice-200"
            >
              Segments
            </Link>
            <Link
              href="/admin/crm/insights"
              className="inline-flex h-11 items-center rounded-xl bg-vermilion-600 px-4 text-sm text-rice-50 hover:bg-vermilion-700"
            >
              AI insights
            </Link>
          </>
        }
      />

      <section aria-label="CRM summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Customers" value={formatNumber(stats.customer_count)} />
        <StatCard label="Lifetime value" value={formatPrice(stats.lifetime_value)} tone="good" />
        <StatCard
          label="Repeat customers"
          value={formatNumber(stats.repeat_customers)}
          hint="3 or more orders"
        />
        <StatCard
          label="At risk"
          value={formatNumber(stats.at_risk_customers)}
          hint="No order in 30+ days"
          tone={stats.at_risk_customers > 0 ? "warn" : "neutral"}
        />
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="crm-search" className="block text-xs font-medium text-ink-800">
            Search
          </label>
          <input
            id="crm-search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name or phone"
            className="mt-1 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        </div>
        <div>
          <label htmlFor="crm-sort" className="block text-xs font-medium text-ink-800">
            Sort by
          </label>
          <select
            id="crm-sort"
            name="sort"
            defaultValue={sort}
            className="mt-1 h-11 rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="lifetime_value">Total spend</option>
            <option value="orders">Order count</option>
            <option value="recent">Most recent order</option>
            <option value="at_risk">At risk first</option>
          </select>
        </div>
        <Button type="submit" size="md">
          Apply
        </Button>
        {params.q || params.sort ? (
          <Link
            href="/admin/crm"
            className="inline-flex h-11 items-center rounded-xl border border-ink-900/15 px-4 text-sm text-ink-800 hover:bg-rice-200"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {sorted.length === 0 ? (
        <EmptyState
          title={params.q ? "No customer matches that search" : "No customers yet"}
          description={
            params.q
              ? "Try a different name or phone number, or clear the search."
              : "Customers appear here when they create an account."
          }
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((customer) => {
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
                      {customer.is_blocked ? <Badge tone="danger">Blocked</Badge> : null}
                      {lapsed ? <Badge tone="warning">Lapsed</Badge> : null}
                      {customer.marketing_opt_in ? (
                        <Badge tone="info">Opted in</Badge>
                      ) : null}
                      {customer.points_balance > 0 ? (
                        <Badge tone="indigo">
                          {humanise(customer.tier)} · {formatNumber(customer.points_balance)} pts
                        </Badge>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-ink-800">
                      {customer.phone ?? "No phone"}
                      {customer.email ? (
                        <span className="text-ink-700/65"> · {customer.email}</span>
                      ) : null}
                    </p>

                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-700/75">
                      <div className="flex gap-1.5">
                        <dt>Orders:</dt>
                        <dd className="tabular-nums text-ink-800">{customer.order_count}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Spend:</dt>
                        <dd className="tabular-nums text-ink-800">
                          {formatPrice(customer.lifetime_value)}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Avg order:</dt>
                        <dd className="tabular-nums text-ink-800">
                          {formatPrice(customer.avg_order_value)}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Last order:</dt>
                        <dd className="text-ink-800">
                          {customer.last_order_at
                            ? `${formatDate(customer.last_order_at)}${
                                customer.days_since_last_order !== null
                                  ? ` (${customer.days_since_last_order}d ago)`
                                  : ""
                              }`
                            : "Never"}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Joined:</dt>
                        <dd className="text-ink-800">{formatDate(customer.created_at)}</dd>
                      </div>
                    </dl>

                    {customer.favorite_items && customer.favorite_items.length > 0 ? (
                      <p className="mt-1.5 text-xs text-ink-700/70">
                        Usually orders: {customer.favorite_items.slice(0, 3).join(", ")}
                      </p>
                    ) : null}
                  </div>

                  <Link
                    href={`/admin/crm/${customer.user_id}`}
                    className="shrink-0 rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs font-medium text-ink-800 hover:bg-rice-200"
                  >
                    Profile
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
