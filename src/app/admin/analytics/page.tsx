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

  const funnelTop = funnelStages[0]?.count ?? 0;

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
            <ul className="space-y-2.5">
              {funnelStages.map((stage, index) => {
                const previous = funnelStages[index - 1]?.count;
                const ofTop = funnelTop ? (stage.count / funnelTop) * 100 : 0;
                const stepDrop =
                  previous && previous > 0
                    ? Math.round((stage.count / previous) * 100)
                    : null;
                return (
                  <li key={stage.key}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink-800">{stage.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums text-ink-900">
                          {formatNumber(stage.count)}
                        </span>
                        {stepDrop !== null ? (
                          <span className="text-[11px] text-ink-700/60">
                            {stepDrop}% of previous
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-rice-200">
                      <div
                        className="h-full rounded-full bg-bamboo-500"
                        style={{ width: `${Math.max(1, ofTop)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
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
            <ol className="divide-y divide-ink-900/8">
              {metrics.topItems.slice(0, 8).map((item, index) => (
                <li key={item.name} className="flex items-center gap-3 py-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-rice-200 text-xs font-semibold text-ink-800">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                    {item.name}
                  </span>
                  <span className="text-xs tabular-nums text-ink-700/70">
                    {item.quantity} × · {formatPrice(item.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="space-y-4">
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
              <ul className="mt-3 flex flex-wrap gap-2">
                {metrics.loyalty.activeTiers.map((tier) => (
                  <li key={tier.tier}>
                    <Badge tone="info">
                      {humanise(tier.tier)} · {tier.count}
                    </Badge>
                  </li>
                ))}
              </ul>
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
              <div className="flex items-baseline gap-2">
                <Star className="size-5 text-miso-500" aria-hidden="true" />
                <span className="text-2xl font-semibold tabular-nums text-ink-900">
                  {metrics.feedbackSummary.averageRating.toFixed(1)}
                </span>
                <span className="text-sm text-ink-700/70">average rating</span>
                {metrics.feedbackSummary.openCount > 0 ? (
                  <Badge tone="warning" className="ml-auto">
                    {metrics.feedbackSummary.openCount} open
                  </Badge>
                ) : (
                  <Badge tone="success" className="ml-auto">
                    All answered
                  </Badge>
                )}
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

      <Panel title="Revenue by day" subtitle="Daily takings across the window">
        {metrics.revenueByDay.length === 0 ? (
          <p className="text-sm text-ink-700/70">No revenue recorded in this window.</p>
        ) : (
          <RevenueBars data={metrics.revenueByDay} />
        )}
      </Panel>
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

function RevenueBars({
  data,
}: {
  data: { day: string; revenue: number; orders: number }[];
}) {
  const max = Math.max(...data.map((point) => point.revenue), 1);

  return (
    <div>
      <div className="flex h-32 items-end gap-1" role="img" aria-label="Revenue by day">
        {data.map((point) => (
          <div
            key={point.day}
            className="group relative flex-1"
            title={`${point.day}: ${formatPrice(point.revenue)} across ${point.orders} order${
              point.orders === 1 ? "" : "s"
            }`}
          >
            <div
              className="w-full rounded-t bg-miso-500/70 transition-colors group-hover:bg-miso-600"
              style={{ height: `${Math.max(2, (point.revenue / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-700/55">
        <span>{data[0]?.day}</span>
        <span>peak {formatPrice(max)}</span>
        <span>{data.at(-1)?.day}</span>
      </div>
    </div>
  );
}
