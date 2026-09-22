import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, MapPin, Receipt, Store, Truck } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/services/orders";
import {
  ORDER_STATUS_HINTS,
  ORDER_STATUS_LABELS,
  buildTimeline,
  isActive,
} from "@/lib/services/order-status";
import { Badge } from "@/components/ui/button";
import { OrderStatusRealtime } from "@/components/customer/order-status-realtime";
import { OrderTimeline } from "@/components/customer/order-timeline";
import { CancelOrderButton } from "@/components/customer/cancel-order-button";
import { ReorderButton } from "@/components/customer/reorder-button";
import { formatDateTime, formatPrice, humanise } from "@/lib/utils/format";

type AddressSnapshot = {
  label?: string | null;
  address_line?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  landmark?: string | null;
  notes?: string | null;
};

/** Reads the delivery address recorded on the order at placement time. */
function parseAddressSnapshot(value: unknown): AddressSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  const pick = (key: string) =>
    typeof snapshot[key] === "string" ? (snapshot[key] as string) : null;

  const parsed: AddressSnapshot = {
    label: pick("label"),
    address_line: pick("address_line"),
    building: pick("building"),
    floor: pick("floor"),
    apartment: pick("apartment"),
    landmark: pick("landmark"),
    notes: pick("notes"),
  };

  const hasAnything = Object.values(parsed).some(Boolean);
  return hasAnything ? parsed : null;
}

export const metadata: Metadata = buildMetadata({
  title: "Order tracking",
  description: "Follow your Panda Wok order from the kitchen to your door.",
  path: "/orders",
  noIndex: true,
});

export default async function OrderTrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const [{ orderId }, { placed }] = await Promise.all([params, searchParams]);

  const session = await getSession();
  if (!session) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(`/orders/${orderId}`)}`);
  }

  // RLS scopes this to the owner (or staff), so a wrong id simply 404s.
  const order = await getOrderForViewer(orderId);
  if (!order) notFound();

  // The address is stored as a snapshot on the order, so tracking still shows
  // where it went even if the customer later edits or deletes the address.
  const address = parseAddressSnapshot(order.address_snapshot);

  const isPickup = order.fulfillment === "pickup";
  const timeline = buildTimeline(order.status, order.order_status_history, isPickup);
  const active = isActive(order.status);
  const failed = ["canceled", "rejected", "failed", "refunded"].includes(order.status);
  const canCancel = ["new", "accepted"].includes(order.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {placed === "1" ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-xl border border-jade-500/30 bg-jade-500/10 p-4"
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-jade-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ink-900">Order placed</p>
            <p className="mt-0.5 text-xs text-ink-700/85">
              The kitchen has received it. We will update this page as it progresses.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            Order #{order.order_number}
          </h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Placed {formatDateTime(order.created_at)}
          </p>
          {active ? (
            <OrderStatusRealtime orderId={order.id} enabled />
          ) : (
            <p className="mt-1 text-xs text-ink-700/65">
              This order is complete and no longer updates.
            </p>
          )}
        </div>
        <Badge tone={failed ? "danger" : active ? "info" : "success"}>
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <p className="mt-3 rounded-xl bg-rice-200/60 px-3.5 py-3 text-sm text-ink-800">
        {ORDER_STATUS_HINTS[order.status]}
      </p>

      {order.eta_minutes && active ? (
        <p className="mt-2 text-sm text-ink-700/85">
          Estimated about {order.eta_minutes} minutes once preparation starts.
        </p>
      ) : null}

      <section aria-labelledby="timeline-heading" className="washi-panel mt-5 p-4">
        <h2 id="timeline-heading" className="text-sm font-semibold text-ink-900">
          Progress
        </h2>
        <OrderTimeline steps={timeline} />
      </section>

      <section aria-labelledby="items-heading" className="washi-panel mt-3 p-4">
        <h2
          id="items-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
        >
          <Receipt className="size-4 text-plum-600" aria-hidden="true" />
          What you ordered
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {order.order_items.map((item) => {
            const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
            return (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-ink-900">
                    {item.quantity} × {item.name_snapshot}
                  </span>
                  {modifiers.length > 0 ? (
                    <span className="mt-0.5 block text-xs text-ink-700/70">
                      {modifiers
                        .map((m) =>
                          typeof m === "object" && m && "name" in m
                            ? String((m as { name: unknown }).name)
                            : "",
                        )
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  ) : null}
                  {item.notes ? (
                    <span className="mt-0.5 block text-xs italic text-ink-700/60">
                      “{item.notes}”
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums text-ink-800">
                  {formatPrice(item.line_total)}
                </span>
              </li>
            );
          })}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-ink-900/8 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-700/85">Subtotal</dt>
            <dd className="tabular-nums">{formatPrice(order.subtotal)}</dd>
          </div>
          {Number(order.discount_total) > 0 ? (
            <div className="flex justify-between text-jade-600">
              <dt>Discount</dt>
              <dd className="tabular-nums">
                −{formatPrice(order.discount_total)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-ink-700/85">
              {isPickup ? "Pickup" : "Delivery"}
            </dt>
            <dd className="tabular-nums">
              {Number(order.delivery_fee) === 0
                ? "Free"
                : formatPrice(order.delivery_fee)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700/85">Tax</dt>
            <dd className="tabular-nums">{formatPrice(order.tax_total)}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-ink-900/8 pt-2.5 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPrice(order.total)}</dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-ink-700/70">
          Payment: {humanise(order.payment_method)} ·{" "}
          {humanise(order.payment_status)}
        </p>
      </section>

      <section aria-labelledby="where-heading" className="washi-panel mt-3 p-4">
        <h2
          id="where-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
        >
          {isPickup ? (
            <Store className="size-4 text-plum-600" aria-hidden="true" />
          ) : (
            <Truck className="size-4 text-plum-600" aria-hidden="true" />
          )}
          {isPickup ? "Pickup" : "Delivery details"}
        </h2>

        {isPickup ? (
          <p className="mt-2 text-sm text-ink-700/85">
            You chose to collect this order from the kitchen. Please check{" "}
            <Link href="/contact" className="font-medium text-plum-600">
              our contact details
            </Link>{" "}
            for collection information.
          </p>
        ) : address ? (
          <address className="mt-2 text-sm not-italic text-ink-800">
            <span className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-700/60" aria-hidden="true" />
              <span>
                {[
                  address.address_line,
                  address.building ? `Building ${address.building}` : null,
                  address.floor ? `Floor ${address.floor}` : null,
                  address.apartment ? `Apt ${address.apartment}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {address.landmark ? (
                  <span className="mt-0.5 block text-xs text-ink-700/70">
                    Landmark: {address.landmark}
                  </span>
                ) : null}
              </span>
            </span>
          </address>
        ) : (
          <p className="mt-2 text-sm text-ink-700/80">
            The saved address for this order is no longer available in your address book.
            Please contact the kitchen if you need to confirm it.
          </p>
        )}

        {order.customer_note ? (
          <p className="mt-3 rounded-lg bg-rice-200/60 px-3 py-2 text-xs text-ink-800">
            Your note: “{order.customer_note}”
          </p>
        ) : null}
      </section>

      {order.cancel_reason ? (
        <p className="mt-3 rounded-xl border border-miso-500/30 bg-miso-300/15 p-3.5 text-sm text-ink-800">
          {order.cancel_reason}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        {canCancel ? <CancelOrderButton orderId={order.id} /> : null}
        <ReorderButton
          items={order.order_items
            .filter(
              (item): item is typeof item & { menu_item_id: string } =>
                Boolean(item.menu_item_id),
            )
            .map((item) => ({
              menuItemId: item.menu_item_id,
              name: item.name_snapshot,
              quantity: item.quantity,
              unitPrice: Number(item.unit_price),
            }))}
        />
        <Link
          href="/orders"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-ink-900/15 bg-rice-50 px-5 text-sm font-medium text-ink-900 hover:bg-rice-200 sm:flex-1"
        >
          All your orders
        </Link>
      </div>

      <p className="mt-4 text-center text-xs text-ink-700/65">
        Need to change something? Please{" "}
        <Link href="/contact" className="font-medium text-plum-600">
          contact the kitchen
        </Link>{" "}
        and quote order #{order.order_number}.
      </p>
    </div>
  );
}
