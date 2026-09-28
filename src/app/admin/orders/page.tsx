import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import {
  countAdminOrders,
  getOrderStatusCounts,
  listAdminOrders,
} from "@/lib/services/admin-orders";
import type { OrderStatus } from "@/lib/services/admin-orders";
import { Badge, Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  DEFAULT_PAGE_SIZE,
  Pagination,
  resolvePage,
} from "@/components/ui/pagination";
import { OrderStatusControl } from "@/components/admin/order-status-control";
import { LiveOrdersFeed } from "@/components/admin/live-refresh";
import { formatDateTime, formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const TABS: { key: OrderStatus | "active" | "all" }[] = [
  { key: "active" },
  { key: "new" },
  { key: "in_progress" },
  { key: "prepared" },
  { key: "out_for_delivery" },
  { key: "finished" },
  { key: "canceled" },
  { key: "all" },
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireCapability("orders.view");

  const t = await getT(await getAdminLocale());
  const params = await searchParams;
  const requested = params.status ?? "active";
  const status = TABS.some((tab) => tab.key === requested)
    ? (requested as OrderStatus | "active" | "all")
    : "active";
  const page = resolvePage(params.page);
  const pageSize = DEFAULT_PAGE_SIZE;

  const filter = { status, search: params.q };

  const [orders, counts, total] = await Promise.all([
    listAdminOrders({ ...filter, limit: pageSize, offset: (page - 1) * pageSize }),
    getOrderStatusCounts(),
    countAdminOrders(filter),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("admin.pages.orders.eyebrow")}
        title={t("admin.pages.orders.title")}
        description={t("admin.pages.orders.description")}
        actions={<LiveOrdersFeed />}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="status" value={status} />
        <div className="min-w-56 flex-1">
          <label htmlFor="order-search" className="block text-xs font-medium text-ink-800">
            {t("admin.pages.orders.searchLabel")}
          </label>
          <input
            id="order-search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="PW-2609-1001"
            className="mt-1 h-10 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        </div>
        <Button type="submit" size="md">
          {t("admin.pages.orders.search")}
        </Button>
        {params.q ? (
          <Link
            href={`/admin/orders?status=${status}`}
            className="inline-flex h-11 items-center rounded-xl border border-ink-900/15 px-4 text-sm text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.orders.clear")}
          </Link>
        ) : null}
      </form>

      <nav aria-label={t("admin.pages.orders.filter")} className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const count = counts[tab.key] ?? 0;
          const active = tab.key === status;
          return (
            <Link
              key={tab.key}
              href={`/admin/orders?status=${tab.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium",
                active
                  ? "border-vermilion-600 bg-vermilion-600 text-rice-50"
                  : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
              )}
            >
              {tab.key === "active" ? t("admin.pages.orders.active") : tab.key === "all" ? t("admin.pages.orders.all") : t(`admin.term.orderStatus.${tab.key}`)}
              <span
                className={cn(
                  "tabular-nums",
                  active ? "text-rice-50/80" : "text-ink-700/60",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <EmptyState
          title={params.q ? t("admin.pages.orders.emptySearch") : t("admin.pages.orders.empty")}
          description={
            params.q
              ? t("admin.pages.orders.emptySearchBody")
              : t("admin.pages.orders.emptyBody")
          }
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="washi-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-display text-base font-semibold text-ink-900 hover:text-vermilion-600"
                    >
                      #{order.order_number}
                    </Link>
                    <Badge
                      tone={
                        order.status === "finished"
                          ? "success"
                          : ["canceled", "rejected", "failed", "refunded"].includes(
                                order.status,
                              )
                            ? "danger"
                            : order.status === "new"
                              ? "indigo"
                              : "info"
                      }
                    >
                      {t(`admin.term.orderStatus.${order.status}`)}
                    </Badge>
                    {order.payment_status !== "paid" ? (
                      <Badge tone="warning">{t(`admin.term.paymentStatus.${order.payment_status}`)}</Badge>
                    ) : null}
                  </div>

                  <p className="mt-1.5 text-sm text-ink-800">
                    {order.customer_name ?? "Unnamed customer"}
                    {order.customer_phone ? (
                      <span className="text-ink-700/70"> · {order.customer_phone}</span>
                    ) : null}
                  </p>

                  {order.items_summary ? (
                    <p className="mt-0.5 text-xs text-ink-700/75">
                      {order.item_count} item{order.item_count === 1 ? "" : "s"} ·{" "}
                      {order.items_summary}
                    </p>
                  ) : null}

                  <p className="mt-1.5 text-xs text-ink-700/65">
                    {formatDateTime(order.created_at)} · {t(`admin.term.fulfilment.${order.fulfillment}`)} ·{" "}
                    {t(`admin.term.paymentMethod.${order.payment_method}`)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="font-display text-lg font-semibold tabular-nums text-ink-900">
                    {formatPrice(order.total)}
                  </span>
                  <OrderStatusControl orderId={order.id} current={order.status} compact />
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-xs font-medium text-vermilion-600 hover:text-vermilion-700"
                  >
                    {t("admin.pages.orders.open")}
                  </Link>
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
        basePath="/admin/orders"
        searchParams={{ status, q: params.q }}
      />
    </div>
  );
}
