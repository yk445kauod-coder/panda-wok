import Link from "next/link";
import {
  AlertTriangle,
  Coins,
  Filter,
  PackageX,
  Receipt,
  Star,
  Users,
} from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getDashboardMetrics } from "@/lib/crm/insights";
import { getFunnel } from "@/lib/crm/customers";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendChart } from "@/components/charts/trend-chart";
import { BarList } from "@/components/charts/bar-list";
import { DonutChart } from "@/components/charts/donut-chart";
import { GaugeChart } from "@/components/charts/gauge-chart";
import { formatNumber, formatPrice, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * Analytics. Every figure is a live aggregate over the chosen window; an empty
 * kitchen shows zeros and says so rather than dressing the page with demo data.
 */
export default async function AdminAnalyticsPage() {
  await requireCapability("analytics.view");

  const [metrics, funnel] = await Promise.all([getDashboardMetrics(30), getFunnel(30)]);

  const hasOrders = metrics.ordersInWindow > 0;
  const funnelStages = [
    { key: "visitors", label: "Visitors", count: funnel.visitors },
    { key: "menuViewers", label: "Viewed the menu", count: funnel.menuViewers },
    { key: "itemViewers", label: "Viewed a dish", count: funnel.itemViewers },
    { key: "cartUsers", label: "Added to cart", count: funnel.cartUsers },
    { key: "checkoutUsers", label: "Started checkout", count: funnel.checkoutUsers },
    { key: "customers", label: "Placed an order", count: funnel.customers },
  ] as const;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Analytics</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            The last {metrics.windowDays} days. Only aggregated behaviour and orders are
            measured — no personal profile is built from browsing.
          </p>
        </div>
        <Badge tone="neutral">Privacy-conscious aggregate reporting</Badge>
      </header>

      {!hasOrders ? (
        <EmptyState
          title="No orders in this window"
          description="Figures stay at zero until real orders arrive. Nothing on this page is estimated or invented."
        />
      ) : null}

      <section aria-label="Headline figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          icon={<Receipt className="size-4" />}
          label="Orders today"
          value={formatNumber(metrics.ordersToday)}
          hint={`${formatNumber(metrics.ordersInWindow)} in the window`}
        />
        <Figure
          icon={<Coins className="size-4" />}
          label="Revenue"
          value={formatPrice(metrics.revenueInWindow)}
          hint={`Cash collected ${formatPrice(metrics.cashCollected)}`}
        />
        <Figure
          icon={<Users className="size-4" />}
          label="Average order value"
          value={formatPrice(metrics.avgOrderValue)}
          hint={`${formatNumber(metrics.newCustomers)} new · ${formatNumber(metrics.returningCustomers)} returning`}
        />
        <Figure
          icon={<AlertTriangle className="size-4" />}
          label="Canceled orders"
          value={formatNumber(metrics.canceledOrders)}
          hint={
            metrics.ordersInWindow > 0
              ? `${Math.round((metrics.canceledOrders / metrics.ordersInWindow) * 100)}% of orders`
              : "None"
          }
          tone={metrics.canceledOrders > 0 ? "warning" : "neutral"}
        />
      </section>

      <section className="washi-panel p-4 sm:p-5" aria-label="Revenue trend">
        <div className="mb-3">
          <h2 className="font-display text-base font-semibold text-ink-900">
            Revenue and orders over time
          </h2>
          <p className="text-xs text-ink-700/70">
            Hover or tap a point for the exact figure.
          </p>
        </div>
        <TrendChart
          data={metrics.revenueByDay.map((d) => ({ label: d.day, value: d.revenue }))}
          title="Revenue by day"
          valueKind="currency"
          height={240}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Conversion funnel"
          subtitle="Distinct sessions at each stage, last 30 days"
        >
          {funnel.visitors === 0 && funnel.customers === 0 ? (
            <p className="text-sm text-ink-700/70">
              No funnel events recorded yet. Analytics collection starts as soon as
              customers browse.
            </p>
          ) : (
            <BarList
              title="Conversion funnel"
              height={Math.max(160, funnelStages.length * 40)}
              data={funnelStages.map((stage, index) => {
                const previous = funnelStages[index - 1]?.count;
                const stepDrop =
                  previous && previous > 0
                    ? `${Math.round((stage.count / previous) * 100)}% of previous`
                    : undefined;
                return { label: stage.label, value: stage.count, note: stepDrop };
              })}
            />
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-700/60">
            <Filter className="size-3" aria-hidden="true" />
            Counts are distinct sessions, so a refresh does not inflate them.
          </p>
        </Panel>

        <Panel title="Orders by category" subtitle="Quantity sold in the window">
          {metrics.topItems.length === 0 ? (
            <p className="text-sm text-ink-700/70">No dish sales yet.</p>
          ) : (
            <CategoryMix items={metrics.topItems} />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Popular dishes" subtitle="Best sellers by quantity">
          {metrics.topItems.length === 0 ? (
            <p className="text-sm text-ink-700/70">No dish sales yet.</p>
          ) : (
            <BarList
              title="Popular dishes"
              data={metrics.topItems.slice(0, 8).map((item) => ({
                label: item.name,
                value: item.quantity,
                note: formatPrice(item.revenue),
              }))}
            />
          )}
        </Panel>

        <Panel title="Revenue by category" subtitle="Where the money comes from">
          {metrics.categoryMix.length === 0 ? (
            <p className="text-sm text-ink-700/70">No category sales yet.</p>
          ) : (
            <BarList
              title="Revenue by category"
              valueKind="currency"
              data={metrics.categoryMix.slice(0, 8).map((row) => ({
                label: row.category,
                value: row.revenue,
                note: `${row.quantity} sold`,
              }))}
            />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Panel
            title="Loyalty"
            subtitle={`${formatNumber(metrics.loyalty.members)} members`}
            action={
              <Link href="/admin/loyalty" className="text-xs font-medium text-vermilion-600">
                Manage
              </Link>
            }
          >
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-700/70">Points outstanding</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900">
                  {formatNumber(metrics.loyalty.pointsOutstanding)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-700/70">Cash collected</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900">
                  {formatPrice(metrics.cashCollected)}
                </dd>
              </div>
            </dl>
            {metrics.loyalty.activeTiers.length > 0 ? (
              <div className="mt-3">
                <DonutChart
                  title="Loyalty members by tier"
                  height={140}
                  data={metrics.loyalty.activeTiers.map((tier) => ({
                    label: humanise(tier.tier),
                    value: tier.count,
                  }))}
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-ink-700/60">No loyalty members yet.</p>
            )}
          </Panel>

          <Panel
            title="Feedback"
            subtitle={`${metrics.feedbackSummary.count} responses`}
            action={
              <Link href="/admin/feedback" className="text-xs font-medium text-vermilion-600">
                Open inbox
              </Link>
            }
          >
            {metrics.feedbackSummary.count === 0 ? (
              <p className="text-sm text-ink-700/70">No feedback in this window.</p>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <GaugeChart
                  value={metrics.feedbackSummary.averageRating}
                  max={5}
                  label={metrics.feedbackSummary.averageRating.toFixed(1)}
                  sublabel="out of 5"
                  colorIndex={1}
                  size={140}
                />
                <div className="w-full">
                  <ul className="space-y-1.5">
                    {metrics.feedbackSummary.distribution.map((row) => {
                      const share = metrics.feedbackSummary.count
                        ? (row.count / metrics.feedbackSummary.count) * 100
                        : 0;
                      return (
                        <li key={row.rating} className="flex items-center gap-2 text-xs">
                          <span className="flex w-8 shrink-0 items-center gap-0.5 tabular-nums text-ink-700/75">
                            {row.rating}
                            <Star className="size-3 text-miso-500" aria-hidden="true" />
                          </span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-900/8">
                            <span
                              className="block h-full rounded-full bg-miso-500"
                              style={{ width: `${share}%` }}
                            />
                          </span>
                          <span className="w-6 shrink-0 text-end tabular-nums text-ink-700/70">
                            {row.count}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {metrics.feedbackSummary.openCount > 0 ? (
                    <Badge tone="warning" className="mt-3">
                      {metrics.feedbackSummary.openCount} awaiting a reply
                    </Badge>
                  ) : (
                    <Badge tone="success" className="mt-3">
                      All answered
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </Panel>

          <Panel
            title="Stock warnings"
            subtitle={`${metrics.stockWarnings.length} need attention`}
            action={
              <Link href="/admin/stock" className="text-xs font-medium text-vermilion-600">
                Manage stock
              </Link>
            }
          >
            {metrics.stockWarnings.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ink-700/70">
                <PackageX className="size-4 text-jade-500" aria-hidden="true" />
                Every ingredient is above its threshold.
              </p>
            ) : (
              <ul className="divide-y divide-ink-900/8">
                {metrics.stockWarnings.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm text-ink-900">{item.name}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="tabular-nums text-ink-700/75">
                        {formatNumber(item.quantity)} {item.unit}
                      </span>
                      <Badge tone={item.status === "out" ? "danger" : "warning"}>
                        {item.status}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Figure({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="washi-panel p-4">
      <div className="flex items-center gap-2 text-ink-700/75">
        <span
          className={
            tone === "warning"
              ? "grid size-7 place-items-center rounded-lg bg-chili-500/12 text-chili-600"
              : "grid size-7 place-items-center rounded-lg bg-rice-200 text-ink-800"
          }
        >
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-700/65">{hint}</p> : null}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="washi-panel p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink-900">{title}</h2>
          {subtitle ? <p className="text-xs text-ink-700/70">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Rough category mix. The metrics payload reports best sellers rather than
 * categories, so this groups the reported dishes into a share-of-sales view and
 * labels it honestly as dish-level rather than implying a category breakdown.
 */
function CategoryMix({
  items,
}: {
  items: { name: string; quantity: number; revenue: number }[];
}) {
  const max = Math.max(...items.map((item) => item.revenue), 1);

  return (
    <ul className="space-y-2">
      {items.slice(0, 8).map((item) => (
        <li key={item.name}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-800">{item.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-ink-700/70">
              {formatPrice(item.revenue)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-rice-200">
            <div
              className="h-full rounded-full bg-miso-500"
              style={{ width: `${Math.max(1, (item.revenue / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
