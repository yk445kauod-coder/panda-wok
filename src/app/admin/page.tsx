import Link from "next/link";
import { AlertTriangle, Coins, PackageX, Receipt, Star, Users } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getDashboardMetrics } from "@/lib/crm/insights";
import { countUnreadForStaff } from "@/lib/services/messaging";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/admin/stat-card";
import { TrendChart } from "@/components/charts/trend-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarList } from "@/components/charts/bar-list";
import { GaugeChart } from "@/components/charts/gauge-chart";
import { RadarChart } from "@/components/charts/radar-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { formatDateTime, formatNumber, formatPrice, humanise } from "@/lib/utils/format";

/**
 * Operational overview, built as a visual report rather than a wall of numbers.
 * Every figure is computed from real rows in the window; an empty kitchen shows
 * zeros and an explicit prompt rather than demo data.
 */
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const session = await requireCapability("orders.view");
  const [metrics, unread] = await Promise.all([
    getDashboardMetrics(30),
    countUnreadForStaff().catch(() => 0),
  ]);

  const noData = metrics.ordersInWindow === 0;
  const revenueTrend = metrics.revenueByDay.map((d) => d.revenue);
  const orderTrend = metrics.revenueByDay.map((d) => d.orders);

  // Turn the daily series into a weekday x week grid for the heatmap, so the
  // month's rhythm (which weekdays carry the trade) is visible as a pattern.
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekRows: string[] = [];
  const heatCells: { x: string; y: string; value: number }[] = [];
  metrics.revenueByDay.forEach((day, index) => {
    const date = new Date(`${day.day}T00:00:00Z`);
    const weekday = weekdayLabels[(date.getUTCDay() + 6) % 7];
    const weekRow = `Week ${Math.floor(index / 7) + 1}`;
    if (!weekRows.includes(weekRow)) weekRows.push(weekRow);
    heatCells.push({ x: weekday, y: weekRow, value: day.orders });
  });

  // Revenue by weekday, as a radar. Unlike a normalised radar, every axis is
  // money, so the shape is comparable directly and the tooltip prints the real
  // total for that day of the week.
  const weekdayRevenue = weekdayLabels.map((label, weekdayIndex) => {
    const total = metrics.revenueByDay
      .filter((day) => {
        const date = new Date(`${day.day}T00:00:00Z`);
        return (date.getUTCDay() + 6) % 7 === weekdayIndex;
      })
      .reduce((sum, day) => sum + day.revenue, 0);
    return { label, value: total, display: formatPrice(total) };
  });
  const radarMax = Math.max(...weekdayRevenue.map((d) => d.value), 1);
  const radarAxes = weekdayRevenue.map((d) => ({
    ...d,
    value: (d.value / radarMax) * 100,
  }));

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-ink-900/10 bg-ink-950 p-5 text-rice-100 sm:p-6">
        <div
          className="absolute inset-y-0 end-0 w-1/3 bg-gradient-to-l from-vermilion-600/30 to-transparent"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-3xs font-semibold tracking-widest text-rice-300/70 uppercase">
              {new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date())}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-rice-50">
              {session.profile?.full_name
                ? `Welcome back, ${session.profile.full_name.split(" ")[0]}`
                : "Welcome to the kitchen"}
            </h1>
            <p className="mt-1 text-sm text-rice-200/85">
              The last {metrics.windowDays} days at Panda Wok.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 ? (
              <Link href="/admin/chat">
                <Badge tone="indigo">
                  {unread} unread message{unread === 1 ? "" : "s"}
                </Badge>
              </Link>
            ) : null}
            <Link
              href="/admin/orders?status=new"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-vermilion-600 px-4 text-sm font-medium text-rice-50 transition-colors hover:bg-vermilion-700"
            >
              Open the order queue
            </Link>
          </div>
        </div>
      </header>

      {noData ? (
        <EmptyState
          title="No orders yet in this window"
          description="This is a live view of the database, so the charts stay empty until real orders arrive. Seed data is never invented for you."
          action={
            <Link
              href="/menu"
              className="text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
            >
              Check the customer site
            </Link>
          }
        />
      ) : null}

      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Receipt}
          label="Orders today"
          value={formatNumber(metrics.ordersToday)}
          hint={`${formatNumber(metrics.ordersInWindow)} in ${metrics.windowDays} days`}
          trend={orderTrend}
        />
        <StatCard
          icon={Coins}
          label="Revenue"
          value={formatPrice(metrics.revenueInWindow)}
          hint={`Average ${formatPrice(metrics.avgOrderValue)} per order`}
          trend={revenueTrend}
          tone="info"
        />
        <StatCard
          icon={Users}
          label="Customers"
          value={formatNumber(metrics.newCustomers + metrics.returningCustomers)}
          hint={`${formatNumber(metrics.newCustomers)} new · ${formatNumber(metrics.returningCustomers)} returning`}
          tone="success"
        />
        <StatCard
          icon={AlertTriangle}
          label="Canceled"
          value={formatNumber(metrics.canceledOrders)}
          hint={metrics.canceledOrders === 0 ? "None — good" : "Review the reasons below"}
          tone={metrics.canceledOrders > 0 ? "warning" : "neutral"}
        />
      </section>

      <section className="washi-panel p-4 sm:p-5" aria-label="Revenue trend">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-ink-900">
              Revenue by day
            </h2>
            <p className="text-xs text-ink-700/70">
              {metrics.windowDays}-day trend · hover or tap a point for the figure
            </p>
          </div>
          <Badge tone="info">peak {formatPrice(Math.max(...revenueTrend, 0))}</Badge>
        </div>
        <TrendChart
          data={metrics.revenueByDay.map((d) => ({ label: d.day, value: d.revenue }))}
          title="Revenue by day"
          valueKind="currency"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="washi-panel p-4 sm:p-5" aria-label="Order pipeline">
          <h2 className="font-display text-base font-semibold text-ink-900">
            Order pipeline
          </h2>
          <p className="mb-3 text-xs text-ink-700/70">Current status mix</p>
          <DonutChart
            title="Order pipeline by status"
            centerLabel={formatNumber(metrics.ordersInWindow)}
            data={metrics.statusBreakdown.map((row) => ({
              label: humanise(row.status),
              value: row.count,
            }))}
          />
        </section>

        <section className="washi-panel p-4 sm:p-5 lg:col-span-2" aria-label="Order rhythm">
          <h2 className="font-display text-base font-semibold text-ink-900">
            Order rhythm
          </h2>
          <p className="mb-3 text-xs text-ink-700/70">
            Orders per weekday, darker meaning busier. Hover a cell for the daily total.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Heatmap
              cells={heatCells}
              xLabels={weekdayLabels}
              yLabels={weekRows}
              title="orders"
              height={200}
            />
            <div>
              <p className="mb-1 text-xs font-medium text-ink-700/75">
                Revenue by weekday
              </p>
              <RadarChart axes={radarAxes} title="Revenue by weekday" height={200} colorIndex={1} />
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="washi-panel p-4 sm:p-5" aria-label="Popular dishes">
          <h2 className="font-display text-base font-semibold text-ink-900">
            Popular dishes
          </h2>
          <p className="mb-3 text-xs text-ink-700/70">By quantity sold in the window</p>
          <BarList
            title="Popular dishes"
            emptyLabel="No dish sales yet."
            data={metrics.topItems.slice(0, 7).map((item) => ({
              label: item.name,
              value: item.quantity,
              note: formatPrice(item.revenue),
            }))}
          />
        </section>

        <section className="washi-panel p-4 sm:p-5" aria-label="Category mix">
          <h2 className="font-display text-base font-semibold text-ink-900">
            Category mix
          </h2>
          <p className="mb-3 text-xs text-ink-700/70">Revenue by menu category</p>
          <BarList
            title="Category mix"
            valueKind="currency"
            emptyLabel="No category sales yet."
            data={metrics.categoryMix.slice(0, 7).map((row) => ({
              label: row.category,
              value: row.revenue,
              note: `${row.quantity} sold`,
            }))}
          />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="washi-panel p-4 sm:p-5" aria-label="Feedback">
          <h2 className="font-display text-base font-semibold text-ink-900">Feedback</h2>
          <p className="mb-3 text-xs text-ink-700/70">
            {metrics.feedbackSummary.count} response
            {metrics.feedbackSummary.count === 1 ? "" : "s"} in the window
          </p>
          {metrics.feedbackSummary.count === 0 ? (
            <p className="py-5 text-center text-sm text-ink-700/65">
              No feedback submitted yet.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <GaugeChart
                value={metrics.feedbackSummary.averageRating}
                max={5}
                label={metrics.feedbackSummary.averageRating.toFixed(1)}
                sublabel="out of 5"
                colorIndex={1}
              />
              <ul className="w-full space-y-1.5">
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
            </div>
          )}
          {metrics.feedbackSummary.openCount > 0 ? (
            <Link
              href="/admin/feedback"
              className="mt-3 inline-block text-xs font-medium text-vermilion-600"
            >
              {metrics.feedbackSummary.openCount} awaiting a reply →
            </Link>
          ) : null}
        </section>

        <section className="washi-panel p-4 sm:p-5" aria-label="Loyalty">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-ink-900">Loyalty</h2>
              <p className="text-xs text-ink-700/70">
                {formatNumber(metrics.loyalty.members)} members
              </p>
            </div>
            <Link href="/admin/loyalty" className="text-xs font-medium text-vermilion-600">
              Open
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-rice-100/70 p-3">
              <dt className="text-xs text-ink-700/70">Points outstanding</dt>
              <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-ink-900">
                {formatNumber(metrics.loyalty.pointsOutstanding)}
              </dd>
            </div>
            <div className="rounded-xl bg-rice-100/70 p-3">
              <dt className="text-xs text-ink-700/70">Cash collected</dt>
              <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-ink-900">
                {formatPrice(metrics.cashCollected)}
              </dd>
            </div>
          </dl>
          {metrics.loyalty.activeTiers.length > 0 ? (
            <div className="mt-3">
              <DonutChart
                title="Loyalty members by tier"
                height={150}
                data={metrics.loyalty.activeTiers.map((tier) => ({
                  label: humanise(tier.tier),
                  value: tier.count,
                }))}
              />
            </div>
          ) : null}
        </section>

        <section className="washi-panel p-4 sm:p-5" aria-label="Stock warnings">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-ink-900">Stock</h2>
              <p className="text-xs text-ink-700/70">
                {metrics.stockWarnings.length > 0
                  ? `${metrics.stockWarnings.length} need attention`
                  : "All above threshold"}
              </p>
            </div>
            <Link href="/admin/stock" className="text-xs font-medium text-vermilion-600">
              Manage
            </Link>
          </div>
          {metrics.stockWarnings.length === 0 ? (
            <p className="flex items-center gap-2 py-5 text-sm text-ink-700/70">
              <PackageX className="size-4 text-jade-500" aria-hidden="true" />
              No ingredient is low or out.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {metrics.stockWarnings.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-ink-900">{item.name}</span>
                    <span className="shrink-0 tabular-nums text-xs text-ink-700/75">
                      {formatNumber(item.quantity)} / {formatNumber(item.min_threshold)}{" "}
                      {item.unit}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-900/8">
                    <span
                      className={
                        item.status === "out"
                          ? "block h-full rounded-full bg-chili-500"
                          : "block h-full rounded-full bg-miso-500"
                      }
                      style={{
                        width: `${
                          item.min_threshold > 0
                            ? Math.min(
                                100,
                                (item.quantity / (item.min_threshold * 2)) * 100,
                              )
                            : item.quantity > 0
                              ? 100
                              : 0
                        }%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-ink-700/55">
        Signed in as {session.profile?.full_name ?? session.email ?? "staff"} ·{" "}
        {humanise(session.role)}. Figures refreshed {formatDateTime(new Date().toISOString())}.
      </p>
    </div>
  );
}
