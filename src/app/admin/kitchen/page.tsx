import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { getKitchenQueue } from "@/lib/services/admin-orders";
import { ORDER_STATUS_LABELS } from "@/lib/services/order-status";
import { Badge } from "@/components/ui/button";
import { OrderStatusControl } from "@/components/admin/order-status-control";
import { LiveOrdersFeed } from "@/components/admin/live-refresh";
import { ElapsedTimer } from "@/components/admin/elapsed-timer";
import { humanise } from "@/lib/utils/format";
import { cn } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * Kitchen pass. Four stages left-to-right in the order a ticket moves through
 * them, oldest first inside each column, with a live clock on every ticket and
 * a realtime subscription so the board never goes stale. A kitchen screen is
 * usually an always-on display, which is why it is the one admin page that
 * updates itself.
 */
export default async function KitchenPage() {
  await requireCapability("kitchen.view");
  const { fresh, cooking, ready, dispatching } = await getKitchenQueue();

  const columns = [
    {
      key: "fresh",
      title: "New tickets",
      hint: "Accept, then start cooking",
      orders: fresh,
      accent: "border-t-vermilion-600",
      tone: "indigo" as const,
    },
    {
      key: "cooking",
      title: "On the wok",
      hint: "Being prepared now",
      orders: cooking,
      accent: "border-t-bamboo-600",
      tone: "info" as const,
    },
    {
      key: "ready",
      title: "Prepared",
      hint: "Waiting for the rider",
      orders: ready,
      accent: "border-t-miso-500",
      tone: "warning" as const,
    },
    {
      key: "dispatching",
      title: "Out for delivery",
      hint: "With the rider",
      orders: dispatching,
      accent: "border-t-jade-500",
      tone: "success" as const,
    },
  ];

  const activeCount = fresh.length + cooking.length;
  const total = activeCount + ready.length + dispatching.length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs font-semibold tracking-wide text-ink-600 uppercase">
            Live pass
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold text-ink-900">Kitchen</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Tickets move left to right. Update a stage the moment it changes so the
            customer sees it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveOrdersFeed label="Live" />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="washi-panel p-4">
          <p className="text-2xs font-semibold tracking-wide text-ink-600 uppercase">
            In the kitchen
          </p>
          <p
            className={cn(
              "mt-1 font-display text-3xl font-semibold tabular-nums",
              activeCount > 0 ? "text-vermilion-600" : "text-ink-900",
            )}
          >
            {activeCount}
          </p>
        </div>
        <div className="washi-panel p-4">
          <p className="text-2xs font-semibold tracking-wide text-ink-600 uppercase">
            Ready to leave
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-miso-600 tabular-nums">
            {ready.length}
          </p>
        </div>
        <div className="washi-panel p-4">
          <p className="text-2xs font-semibold tracking-wide text-ink-600 uppercase">
            Open tickets
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-ink-900 tabular-nums">
            {total}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="washi-panel px-6 py-14 text-center">
          <p className="font-display text-lg font-semibold text-ink-900">
            Nothing cooking right now
          </p>
          <p className="mt-1 text-sm text-ink-700/80">
            New tickets land here the second an order is confirmed.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {columns.map((column) => (
          <section
            key={column.key}
            aria-label={column.title}
            className={cn(
              "washi-panel flex flex-col border-t-4 p-3",
              column.accent,
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <h2 className="font-display text-sm font-semibold text-ink-900">
                  {column.title}
                </h2>
                <p className="text-3xs text-ink-600">{column.hint}</p>
              </div>
              <Badge tone={column.tone}>{column.orders.length}</Badge>
            </div>

            {column.orders.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-ink-600">Empty</p>
            ) : (
              <ul className="space-y-2">
                {[...column.orders]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((order) => (
                    <li
                      key={order.id}
                      className={cn(
                        "rounded-xl border border-ink-900/10 bg-rice-50 p-3",
                        order.customer_note && "border-l-4 border-l-miso-500",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-display text-sm font-semibold text-ink-900 hover:text-vermilion-600"
                        >
                          #{order.order_number}
                        </Link>
                        <ElapsedTimer since={order.created_at} />
                      </div>

                      {order.items_summary ? (
                        <p className="mt-1.5 text-xs leading-relaxed text-ink-800">
                          {order.items_summary}
                        </p>
                      ) : null}

                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-3xs text-ink-600">
                        <span>
                          {order.item_count} item{order.item_count === 1 ? "" : "s"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{humanise(order.fulfillment)}</span>
                      </div>

                      {order.customer_note ? (
                        <p className="mt-1.5 rounded-lg bg-miso-500/12 px-2 py-1 text-3xs text-miso-600">
                          Note: {order.customer_note}
                        </p>
                      ) : null}

                      <p className="mt-1.5 text-3xs text-ink-600">
                        {ORDER_STATUS_LABELS[order.status]}
                      </p>

                      <div className="mt-2">
                        <OrderStatusControl
                          orderId={order.id}
                          current={order.status}
                          compact
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
