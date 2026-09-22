import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getMyOrders } from "@/lib/services/orders";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/button";
import {
  ORDER_STATUS_LABELS,
  isActive,
  type OrderStatus,
} from "@/lib/services/order-status";
import { formatDateTime, formatPrice, humanise } from "@/lib/utils/format";

export const metadata: Metadata = buildMetadata({
  title: "Your orders",
  description: "Track your current Panda Wok order and revisit past ones.",
  path: "/orders",
  noIndex: true,
});

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in?next=%2Forders");

  const orders = await getMyOrders(session.user.id, 30);
  const active = orders.filter((o) => isActive(o.status));
  const past = orders.filter((o) => !isActive(o.status));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink-900">Your orders</h1>
      <p className="mt-1 text-sm text-ink-700/80">
        Everything you have ordered from Panda Wok, newest first.
      </p>

      {orders.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="No orders yet"
          description="Once you place your first order it will appear here with live tracking."
          action={
            <Link
              href="/menu"
              className="inline-flex h-11 items-center rounded-xl bg-plum-600 px-5 text-sm font-medium text-rice-50 hover:bg-plum-700"
            >
              Browse the menu
            </Link>
          }
        />
      ) : (
        <>
          {active.length > 0 ? (
            <section aria-labelledby="active-heading" className="mt-6">
              <h2 id="active-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-700/70">
                In progress
              </h2>
              <ul className="mt-3 space-y-3">
                {active.map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} live />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {past.length > 0 ? (
            <section
              aria-labelledby="past-heading"
              className={active.length > 0 ? "mt-8" : "mt-6"}
            >
              <h2 id="past-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-700/70">
                Order history
              </h2>
              <ul className="mt-3 space-y-3">
                {past.map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function OrderRow({
  order,
  live = false,
}: {
  order: {
    id: string;
    order_number: string;
    status: OrderStatus;
    total: number;
    item_count: number;
    created_at: string;
    eta_minutes: number | null;
    fulfillment: string;
  };
  live?: boolean;
}) {
  const failed = ["canceled", "rejected", "failed", "refunded"].includes(order.status);

  return (
    <Link
      href={`/orders/${order.id}`}
      className="washi-panel block p-4 transition-shadow hover:shadow-washi-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink-900">#{order.order_number}</p>
          <p className="mt-0.5 text-xs text-ink-700/70">
            {formatDateTime(order.created_at)} · {humanise(order.fulfillment)}
          </p>
        </div>
        <Badge tone={failed ? "danger" : isActive(order.status) ? "info" : "success"}>
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-ink-700/85">
          {order.item_count} {order.item_count === 1 ? "item" : "items"}
        </span>
        <span className="font-semibold text-ink-900">{formatPrice(order.total)}</span>
      </div>

      {live ? (
        <p className="mt-2 text-xs text-ink-700/65">
          Open the order to follow it live.
        </p>
      ) : null}
    </Link>
  );
}
