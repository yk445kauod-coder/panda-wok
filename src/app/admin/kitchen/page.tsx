import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { getKitchenQueue } from "@/lib/services/admin-orders";
import { getLocale, getT } from "@/lib/i18n/server";
import { OrderStatusControl } from "@/components/admin/order-status-control";
import {
  KitchenLiveBoard,
  KitchenTicket,
  KitchenColumn,
} from "@/components/admin/kitchen-board";
import { ElapsedTimer } from "@/components/admin/elapsed-timer";
import { humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * Kitchen pass. Four stages left-to-right in the order a ticket moves through
 * them, oldest first inside each column, with a live clock on every ticket.
 *
 * The live behaviour (realtime subscription, fallback polling, the arrival
 * chime and the ticket animations) lives in `KitchenLiveBoard`, a client
 * component, so this page stays a plain server render. The board diffs the set
 * of fresh order ids it is handed, so a new ticket rings and the changed
 * columns cross-fade without the whole document re-mounting.
 */
export default async function KitchenPage() {
  await requireCapability("kitchen.view");
  const locale = await getLocale();
  const t = await getT(locale);
  const { fresh, cooking, ready, dispatching } = await getKitchenQueue();

  const columns = [
    {
      key: "fresh",
      title: t("kds.colFresh"),
      hint: t("kds.colFreshHint"),
      orders: fresh,
      accent: "border-t-vermilion-600",
    },
    {
      key: "cooking",
      title: t("kds.colCooking"),
      hint: t("kds.colCookingHint"),
      orders: cooking,
      accent: "border-t-bamboo-600",
    },
    {
      key: "ready",
      title: t("kds.colReady"),
      hint: t("kds.colReadyHint"),
      orders: ready,
      accent: "border-t-miso-500",
    },
    {
      key: "dispatching",
      title: t("kds.colDispatch"),
      hint: t("kds.colDispatchHint"),
      orders: dispatching,
      accent: "border-t-jade-500",
    },
  ];

  const activeCount = fresh.length + cooking.length;
  const total = activeCount + ready.length + dispatching.length;
  // Sent to the client board so it can tell an arrival from a mere re-render.
  const signature = fresh.map((order) => order.id).join(",");

  const stats = [
    { label: t("kds.statInKitchen"), value: activeCount, tone: activeCount > 0 },
    { label: t("kds.statReady"), value: ready.length, tone: false },
    { label: t("kds.statOpen"), value: total, tone: false },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs font-semibold tracking-wide text-ink-600 uppercase">
            {t("kds.eyebrow")}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold text-ink-900">{t("kds.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700/80">{t("kds.subtitle")}</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="washi-panel p-4">
            <p className="text-2xs font-semibold tracking-wide text-ink-600 uppercase">
              {stat.label}
            </p>
            <p
              className={
                stat.tone
                  ? "mt-1 font-display text-3xl font-semibold tabular-nums text-vermilion-600"
                  : "mt-1 font-display text-3xl font-semibold tabular-nums text-ink-900"
              }
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {total === 0 ? (
        <div className="washi-panel px-6 py-14 text-center">
          <p className="font-display text-lg font-semibold text-ink-900">
            {t("kds.emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-ink-700/80">{t("kds.emptyBody")}</p>
        </div>
      ) : null}

      <KitchenLiveBoard signature={signature} freshCount={total}>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {columns.map((column) => (
            <KitchenColumn
              key={column.key}
              label={column.title}
              count={column.orders.length}
              accent={column.accent}
            >
              {column.orders.length === 0 ? (
                <li className="px-1 py-6 text-center text-xs text-ink-600">
                  {t("kds.columnEmpty")}
                </li>
              ) : (
                [...column.orders]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((order) => (
                    <KitchenTicket
                      key={order.id}
                      highlighted={column.key === "fresh"}
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
                          {order.item_count === 1
                            ? t("kds.item", { count: order.item_count })
                            : t("kds.items", { count: order.item_count })}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{humanise(order.fulfillment)}</span>
                      </div>

                      {order.customer_note ? (
                        <p className="mt-1.5 rounded-lg bg-miso-500/12 px-2 py-1 text-3xs text-miso-600">
                          {t("kds.note")}: {order.customer_note}
                        </p>
                      ) : null}

                      <div className="mt-2">
                        <OrderStatusControl
                          orderId={order.id}
                          current={order.status}
                          compact
                        />
                      </div>
                    </KitchenTicket>
                  ))
              )}
            </KitchenColumn>
          ))}
        </div>
      </KitchenLiveBoard>
    </div>
  );
}
