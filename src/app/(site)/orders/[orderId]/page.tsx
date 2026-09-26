import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, MapPin, Receipt, Store, Truck } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/services/orders";
import { buildTimeline, isActive } from "@/lib/services/order-status";
import { Badge } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { OrderStatusRealtime } from "@/components/customer/order-status-realtime";
import { OrderTimeline } from "@/components/customer/order-timeline";
import { CancelOrderButton } from "@/components/customer/cancel-order-button";
import { ReorderButton } from "@/components/customer/reorder-button";
import { formatDateTime, formatPrice } from "@/lib/utils/format";
import { getLocale, getT } from "@/lib/i18n/server";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  statusHint,
  statusLabel,
} from "@/lib/i18n/orders";


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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(await getLocale());
  return buildMetadata({
    title: t("orders.trackingMetaTitle"),
    description: t("orders.trackingMetaDescription", { brand: "Panda Wok" }),
    path: "/orders",
    noIndex: true,
  });
}

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

  const locale = await getLocale();
  const t = await getT(locale);

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
        <Reveal>
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-xl border border-jade-500/30 bg-jade-500/10 p-4"
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-jade-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ink-900">{t("orders.orderPlaced")}</p>
            <p className="mt-0.5 text-xs text-ink-700/85">{t("orders.orderPlacedBody")}</p>
          </div>
        </div>
        </Reveal>
      ) : null}

      <Reveal>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {t("orders.trackingTitle", { number: order.order_number })}
          </h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("orders.placed", { date: formatDateTime(order.created_at, locale) })}
          </p>
          {active ? (
            <OrderStatusRealtime orderId={order.id} enabled />
          ) : (
            <p className="mt-1 text-xs text-ink-700/65">{t("orders.completeNoUpdates")}</p>
          )}
        </div>
        <Badge tone={failed ? "danger" : active ? "info" : "success"}>
          {statusLabel(order.status, locale)}
        </Badge>
      </div>

      <p className="mt-3 rounded-xl bg-rice-200/60 px-3.5 py-3 text-sm text-ink-800">
        {statusHint(order.status, locale)}
      </p>

      {order.eta_minutes && active ? (
        <p className="mt-2 text-sm text-ink-700/85">
          {t("orders.etaHint", { minutes: order.eta_minutes })}
        </p>
      ) : null}
      </Reveal>

      <Reveal as="section" aria-labelledby="timeline-heading" className="washi-panel mt-5 p-4" delay={80}>
        <h2 id="timeline-heading" className="text-sm font-semibold text-ink-900">
          {t("orders.progress")}
        </h2>
        <OrderTimeline steps={timeline} locale={locale} />
      </Reveal>

      <Reveal as="section" aria-labelledby="items-heading" className="washi-panel mt-3 p-4" delay={140}>
        <h2
          id="items-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
        >
          <Receipt className="size-4 text-indigo-600" aria-hidden="true" />
          {t("orders.whatYouOrdered")}
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
                  {formatPrice(item.line_total, undefined, locale)}
                </span>
              </li>
            );
          })}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-ink-900/8 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-700/85">{t("orders.subtotal")}</dt>
            <dd className="tabular-nums">
              {formatPrice(order.subtotal, undefined, locale)}
            </dd>
          </div>
          {Number(order.discount_total) > 0 ? (
            <div className="flex justify-between text-jade-600">
              <dt>{t("orders.discount")}</dt>
              <dd className="tabular-nums">
                −{formatPrice(order.discount_total, undefined, locale)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-ink-700/85">
              {isPickup ? t("orders.pickup") : t("orders.delivery")}
            </dt>
            <dd className="tabular-nums">
              {Number(order.delivery_fee) === 0
                ? t("common.free")
                : formatPrice(order.delivery_fee, undefined, locale)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700/85">{t("orders.tax")}</dt>
            <dd className="tabular-nums">
              {formatPrice(order.tax_total, undefined, locale)}
            </dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-ink-900/8 pt-2.5 text-base font-semibold">
            <dt>{t("orders.total")}</dt>
            <dd className="tabular-nums">
              {formatPrice(order.total, undefined, locale)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-ink-700/70">
          {t("orders.payment", {
            method: paymentMethodLabel(order.payment_method, locale),
            status: paymentStatusLabel(order.payment_status, locale),
          })}
        </p>
      </Reveal>

      <Reveal as="section" aria-labelledby="where-heading" className="washi-panel mt-3 p-4" delay={200}>
        <h2
          id="where-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
        >
          {isPickup ? (
            <Store className="size-4 text-indigo-600" aria-hidden="true" />
          ) : (
            <Truck className="size-4 text-indigo-600" aria-hidden="true" />
          )}
          {isPickup ? t("orders.pickupHeading") : t("orders.deliveryDetails")}
        </h2>

        {isPickup ? (
          <p className="mt-2 text-sm text-ink-700/85">
            {t("orders.pickupBodyBefore")}
            <Link href="/contact" className="font-medium text-indigo-600">
              {t("orders.contactDetailsLink")}
            </Link>
            {t("orders.pickupBodyAfter")}
          </p>
        ) : address ? (
          <address className="mt-2 text-sm not-italic text-ink-800">
            <span className="flex items-start gap-1.5">
              <MapPin
                className="mt-0.5 size-3.5 shrink-0 text-ink-700/60"
                aria-hidden="true"
              />
              <span>
                {[
                  address.address_line,
                  address.building
                    ? t("checkout.building", { value: address.building })
                    : null,
                  address.floor ? t("checkout.floor", { value: address.floor }) : null,
                  address.apartment
                    ? t("checkout.apartment", { value: address.apartment })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {address.landmark ? (
                  <span className="mt-0.5 block text-xs text-ink-700/70">
                    {t("checkout.landmark", { value: address.landmark })}
                  </span>
                ) : null}
              </span>
            </span>
          </address>
        ) : (
          <p className="mt-2 text-sm text-ink-700/80">{t("orders.addressGone")}</p>
        )}

        {order.customer_note ? (
          <p className="mt-3 rounded-lg bg-rice-200/60 px-3 py-2 text-xs text-ink-800">
            {t("orders.yourNote", { note: order.customer_note })}
          </p>
        ) : null}
      </Reveal>

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
          {t("orders.allOrders")}
        </Link>
      </div>

      <p className="mt-4 text-center text-xs text-ink-700/65">
        {t("orders.needChange", { number: order.order_number })}
      </p>

    </div>
  );
}
