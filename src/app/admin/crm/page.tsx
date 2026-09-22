import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { listCrmCustomers } from "@/lib/crm/customers";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatNumber, formatPrice, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * CRM home: who our customers are, how much they spend and whether they are
 * still active. At-risk customers are flagged from their real last-order date.
 */
export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  await requireCapability("crm.view");
  const params = await searchParams;

  const customers = await listCrmCustomers({
    search: params.q,
    limit: 100,
  });

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

  const totalValue = customers.reduce((sum, c) => sum + c.lifetime_value, 0);
  const atRisk = customers.filter((c) => (c.days_since_last_order ?? 0) >= 30).length;
  const repeat = customers.filter((c) => c.order_count >= 3).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">CRM</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Every customer with their real order history, spend and engagement. Figures come
            from orders and loyalty rows, never estimates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/crm/segments"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            Segments
          </Link>
          <Link
            href="/admin/crm/insights"
            className="h-10 rounded-xl bg-plum-600 px-4 text-sm leading-10 text-rice-50 hover:bg-plum-700"
          >
            AI insights
          </Link>
        </div>
      </header>

      <section aria-label="CRM summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Customers" value={formatNumber(customers.length)} />
        <Summary label="Lifetime value" value={formatPrice(totalValue)} />
        <Summary label="Repeat customers" value={formatNumber(repeat)} hint="3 or more orders" />
        <Summary
          label="At risk"
          value={formatNumber(atRisk)}
          hint="No order in 30+ days"
          tone={atRisk > 0 ? "warning" : "neutral"}
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
            className="mt-1 h-10 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
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
            className="mt-1 h-10 rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="lifetime_value">Total spend</option>
            <option value="orders">Order count</option>
            <option value="recent">Most recent order</option>
            <option value="at_risk">At risk first</option>
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-xl bg-plum-600 px-4 text-sm font-medium text-rice-50 hover:bg-plum-700"
        >
          Apply
        </button>
        {params.q || params.sort ? (
          <Link
            href="/admin/crm"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
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
                        className="font-display text-base font-semibold text-ink-900 hover:text-plum-600"
                      >
                        {customer.full_name ?? "Unnamed customer"}
                      </Link>
                      {customer.is_blocked ? <Badge tone="danger">Blocked</Badge> : null}
                      {lapsed ? <Badge tone="warning">Lapsed</Badge> : null}
                      {customer.marketing_opt_in ? (
                        <Badge tone="info">Opted in</Badge>
                      ) : null}
                      {customer.points_balance > 0 ? (
                        <Badge tone="plum">
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

function Summary({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="washi-panel p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/75">{label}</p>
      <p
        className={`mt-1 font-display text-xl font-semibold tabular-nums ${
          tone === "warning" ? "text-chili-600" : "text-ink-900"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-700/65">{hint}</p> : null}
    </div>
  );
}
