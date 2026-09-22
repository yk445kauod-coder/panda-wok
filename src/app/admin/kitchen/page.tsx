import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { getKitchenQueue } from "@/lib/services/admin-orders";
import { ORDER_STATUS_LABELS } from "@/lib/services/order-status";
import { Badge } from "@/components/ui/button";
import { OrderStatusControl } from "@/components/admin/order-status-control";
import { formatRelative, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * Kitchen board. Ordered oldest-first in every column so the longest-waiting
 * ticket is always at the top of the list, which is how a real pass works.
 */
export default async function KitchenPage() {
  await requireCapability("kitchen.view");
  const { fresh, cooking, ready, dispatching } = await getKitchenQueue();

  const columns = [
    { key: "fresh", title: "New tickets", orders: fresh, tone: "plum" as const },
    { key: "cooking", title: "On the wok", orders: cooking, tone: "info" as const },
    { key: "ready", title: "Prepared", orders: ready, tone: "warning" as const },
    {
      key: "dispatching",
      title: "Out for delivery",
      orders: dispatching,
      tone: "success" as const,
    },
  ];

  const oldest = [...fresh, ...cooking].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )[0];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Kitchen</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Live tickets, oldest first. Update a ticket as soon as the stage changes so
            the customer sees it.
          </p>
        </div>
        {oldest ? (
          <Badge tone="warning">
            Oldest waiting: {formatRelative(oldest.created_at)}
          </Badge>
        ) : (
          <Badge tone="success">Pass is clear</Badge>
        )}
      </header>

      {fresh.length + cooking.length + ready.length + dispatching.length === 0 ? (
        <div className="washi-panel px-6 py-12 text-center">
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
            className="washi-panel flex flex-col p-3"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="font-display text-sm font-semibold text-ink-900">
                {column.title}
              </h2>
              <Badge tone={column.tone}>{column.orders.length}</Badge>
            </div>

            {column.orders.length === 0 ? (
              <p className="px-1 py-4 text-xs text-ink-700/60">Empty</p>
            ) : (
              <ul className="space-y-2">
                {[...column.orders]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((order) => (
                    <li
                      key={order.id}
                      className="rounded-xl border border-ink-900/10 bg-rice-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="text-sm font-semibold text-ink-900 hover:text-plum-600"
                        >
                          #{order.order_number}
                        </Link>
                        <span className="text-[11px] text-ink-700/65">
                          {formatRelative(order.created_at)}
                        </span>
                      </div>

                      {order.items_summary ? (
                        <p className="mt-1 text-xs text-ink-800">{order.items_summary}</p>
                      ) : null}

                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-700/70">
                        <span>
                          {order.item_count} item{order.item_count === 1 ? "" : "s"}
                        </span>
                        <span>·</span>
                        <span>{humanise(order.fulfillment)}</span>
                        {order.customer_note ? (
                          <>
                            <span>·</span>
                            <span className="text-miso-600">has a note</span>
                          </>
                        ) : null}
                      </div>

                      <p className="mt-1 text-[11px] text-ink-700/60">
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
