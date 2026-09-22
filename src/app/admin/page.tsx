import Link from "next/link";
import {
  AlertTriangle,
  Coins,
  PackageX,
  Receipt,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getDashboardMetrics } from "@/lib/crm/insights";
import { countUnreadForStaff } from "@/lib/services/messaging";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatNumber, formatPrice, humanise } from "@/lib/utils/format";

/**
 * Operational overview. Every figure is computed from real rows in the window;
 * an empty kitchen shows zeros and an explicit prompt rather than demo data.
 */
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const session = await requireCapability("orders.view");
  const [metrics, unread] = await Promise.all([
    getDashboardMetrics(30),
    countUnreadForStaff().catch(() => 0),
  ]);

  const noData =
    metrics.ordersInWindow === 0 && metrics.ordersToday === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Overview</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            The last {metrics.windowDays} days at Panda Wok. Figures update on every load.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 ? (
            <Link href="/admin/chat">
              <Badge tone="plum">{unread} unread message{unread === 1 ? "" : "s"}</Badge>
            </Link>
          ) : null}
          <Link
            href="/admin/orders?status=new"
            className="inline-flex h-10 items-center rounded-xl bg-plum-600 px-4 text-sm font-medium text-rice-50 hover:bg-plum-700"
          >
            Open the order queue
          </Link>
        </div>
      </header>

      {noData ? (
        <EmptyState
          title="No orders yet in this window"
          description="This is a live view of the database, so it stays empty until real orders arrive. Seed data is never invented for you."
          action={
            <Link href="/menu" className="text-sm font-medium text-plum-600 hover:text-plum-700">
              Check the customer site
            </Link>
          }
        />
      ) : null}

      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Receipt className="size-4" />}
          label="Orders today"
          value={formatNumber(metrics.ordersToday)}
          hint={`${formatNumber(metrics.ordersInWindow)} in ${metrics.windowDays} days`}
        />
        <StatCard
          icon={<Coins className="size-4" />}
          label="Revenue"
          value={formatPrice(metrics.revenueInWindow)}
          hint={`Average ${formatPrice(metrics.avgOrderValue)} per order`}
        />
        <StatCard
          icon={<Users className="size-4" />}
          label="Customers"
          value={formatNumber(metrics.newCustomers + metrics.returningCustomers)}
          hint={`${formatNumber(metrics.newCustomers)} new · ${formatNumber(metrics.returningCustomers)} returning`}
        />
        <StatCard
          icon={<AlertTriangle className="size-4" />}
          label="Canceled"
          value={formatNumber(metrics.canceledOrders)}
          hint={metrics.canceledOrders === 0 ? "None — good" : "Review the reasons below"}
          tone={metrics.canceledOrders > 0 ? "warning" : "neutral"}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Revenue by day"
          subtitle={`${metrics.windowDays}-day trend`}
          className="lg:col-span-2"
        >
          {metrics.revenueByDay.length === 0 ? (
            <p className="text-sm text-ink-700/70">No revenue recorded in this window.</p>
          ) : (
            <RevenueChart data={metrics.revenueByDay} />
          )}
        </Panel>

        <Panel title="Order pipeline" subtitle="Current status mix">
          {metrics.statusBreakdown.length === 0 ? (
            <p className="text-sm text-ink-700/70">Nothing in the pipeline.</p>
          ) : (
            <ul className="space-y-2">
              {metrics.statusBreakdown.map((row) => (
                <li key={row.status} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/admin/orders?status=${row.status}`}
                    className="text-ink-800 hover:text-plum-600"
                  >
                    {humanise(row.status)}
                  </Link>
                  <span className="tabular-nums text-ink-700/80">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Popular dishes" subtitle="By quantity sold in the window">
          {metrics.topItems.length === 0 ? (
            <p className="text-sm text-ink-700/70">No dish sales yet.</p>
          ) : (
            <ul className="divide-y divide-ink-900/8">
              {metrics.topItems.slice(0, 6).map((item, index) => (
                <li key={item.name} className="flex items-center gap-3 py-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-rice-200 text-xs font-semibold text-ink-800">
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
            </ul>
          )}
        </Panel>

        <Panel
          title="Stock warnings"
          subtitle={
            metrics.stockWarnings.length > 0
              ? `${metrics.stockWarnings.length} item${metrics.stockWarnings.length === 1 ? "" : "s"} need attention`
              : "Everything is above threshold"
          }
          action={
            <Link href="/admin/stock" className="text-xs font-medium text-plum-600">
              Manage stock
            </Link>
          }
        >
          {metrics.stockWarnings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ink-700/70">
              <PackageX className="size-4 text-jade-500" aria-hidden="true" />
              No ingredient is low or out.
            </p>
          ) : (
            <ul className="divide-y divide-ink-900/8">
              {metrics.stockWarnings.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm text-ink-900">{item.name}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums text-ink-700/75">
                      {formatNumber(item.quantity)} / {formatNumber(item.min_threshold)}{" "}
                      {item.unit}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Feedback" subtitle={`${metrics.feedbackSummary.count} responses`}>
          {metrics.feedbackSummary.count === 0 ? (
            <p className="text-sm text-ink-700/70">No feedback submitted in this window.</p>
          ) : (
            <div className="space-y-3">
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
              <ul className="space-y-1.5">
                {metrics.feedbackSummary.distribution.map((row) => (
                  <li key={row.rating} className="flex items-center gap-2 text-xs">
                    <span className="w-6 shrink-0 tabular-nums text-ink-700/75">
                      {row.rating}★
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-rice-200">
                      <span
                        className="block h-full rounded-full bg-miso-500"
                        style={{
                          width: `${
                            metrics.feedbackSummary.count
                              ? (row.count / metrics.feedbackSummary.count) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums text-ink-700/70">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel
          title="Loyalty"
          subtitle={`${formatNumber(metrics.loyalty.members)} members`}
          action={
            <Link href="/admin/loyalty" className="text-xs font-medium text-plum-600">
              Open loyalty
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
          ) : null}
        </Panel>
      </div>

      <p className="text-xs text-ink-700/55">
        Signed in as {session.profile?.full_name ?? session.email ?? "staff"} ·{" "}
        {humanise(session.role)}. Figures refreshed {formatDateTime(new Date().toISOString())}.
      </p>
    </div>
  );
}

function StatCard({
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
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`washi-panel p-4 ${className ?? ""}`}>
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
 * Plain CSS bar chart. No charting dependency: the data is small, and this
 * keeps the admin bundle light.
 */
function RevenueChart({
  data,
}: {
  data: { day: string; revenue: number; orders: number }[];
}) {
  const max = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="space-y-2">
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
      <div className="flex justify-between text-[10px] text-ink-700/55">
        <span>{data[0]?.day}</span>
        <span className="flex items-center gap-1">
          <TrendingUp className="size-3" aria-hidden="true" />
          peak {formatPrice(max)}
        </span>
        <span>{data.at(-1)?.day}</span>
      </div>
    </div>
  );
}
