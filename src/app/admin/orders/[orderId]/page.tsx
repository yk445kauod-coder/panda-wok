import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone, StickyNote } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getAdminOrder } from "@/lib/services/admin-orders";
import { Badge } from "@/components/ui/button";
import { OrderStatusControl } from "@/components/admin/order-status-control";
import { safeJson } from "@/lib/utils/format";
import { formatDateTime, formatPrice } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type AddressSnapshot = {
  label?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  address_line?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  landmark?: string | null;
  area?: string | null;
  city?: string | null;
  notes?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  accuracy_m?: number | string | null;
  mode?: string;
};

/** Postgres `numeric` arrives as a string; `Number()` normalises either shape. */
function toCoord(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  await requireCapability("orders.view");
  const t = await getT(await getAdminLocale());

  const order = await getAdminOrder(orderId);
  if (!order) notFound();

  const address = safeJson<AddressSnapshot>(order.address_snapshot, {});

  const latitude = toCoord(address.latitude);
  const longitude = toCoord(address.longitude);
  const hasPin = latitude !== null && longitude !== null;
  const mapUrl = hasPin
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : null;

  return (
    <div className="space-y-5">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1.5 text-sm text-ink-700 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("admin.pages.orderDetail.allOrders")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">#{order.order_number}</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("admin.pages.orderDetail.placed")} {formatDateTime(order.created_at)} ·{" "}
            {t(`admin.term.fulfilment.${order.fulfillment}`)} ·{" "}
            {t(`admin.term.paymentMethod.${order.payment_method}`)}
            {order.eta_minutes
              ? ` · ${t("admin.pages.orderDetail.eta", { count: order.eta_minutes })}`
              : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge
              tone={
                order.status === "finished"
                  ? "success"
                  : ["canceled", "rejected", "failed", "refunded"].includes(order.status)
                    ? "danger"
                    : "info"
              }
            >
              {t(`admin.term.orderStatus.${order.status}`)}
            </Badge>
            <Badge tone={order.payment_status === "paid" ? "success" : "warning"}>
              {t("admin.pages.orderDetail.paymentPrefix")}{" "}
              {t(`admin.term.paymentStatus.${order.payment_status}`)}
            </Badge>
            <Badge>{t("admin.pages.orderDetail.itemsCount", { count: order.item_count })}</Badge>
          </div>
        </div>

        <div className="w-full max-w-xs space-y-2">
          <div className="washi-panel px-4 py-3">
            <p className="text-xs text-ink-700/70">{t("admin.pages.orderDetail.orderTotal")}</p>
            <p className="font-display text-xl font-semibold tabular-nums text-ink-900">
              {formatPrice(order.total)}
            </p>
            <dl className="mt-1 space-y-0.5 text-xs text-ink-700/75">
              <div className="flex justify-between">
                <dt>{t("admin.pages.orderDetail.subtotal")}</dt>
                <dd className="tabular-nums">{formatPrice(order.subtotal)}</dd>
              </div>
              {Number(order.discount_total) > 0 ? (
                <div className="flex justify-between text-jade-700">
                  <dt>
                    {t("admin.pages.orderDetail.discount")}
                    {order.offer_name ? (
                      <span className="ms-1 text-ink-700/60">{order.offer_name}</span>
                    ) : null}
                  </dt>
                  <dd className="tabular-nums">−{formatPrice(order.discount_total)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>{t("admin.pages.orderDetail.delivery")}</dt>
                <dd className="tabular-nums">{formatPrice(order.delivery_fee)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("admin.pages.orderDetail.tax")}</dt>
                <dd className="tabular-nums">{formatPrice(order.tax_total)}</dd>
              </div>
            </dl>
          </div>

          <OrderStatusControl orderId={order.id} current={order.status} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="washi-panel p-4" aria-label={t("admin.pages.orderDetail.ariaItems")}>
          <h2 className="font-display text-base font-semibold text-ink-900">
            {t("admin.pages.orderDetail.whatToCook")}
          </h2>
          <ul className="mt-3 divide-y divide-ink-900/8">
            {order.items.map((item) => (
              <li key={item.id} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {item.quantity}× {item.name_snapshot}
                    </p>
                    {Array.isArray(item.modifiers) && item.modifiers.length > 0 ? (
                      <p className="mt-0.5 text-xs text-ink-700/75">
                        {(
                          item.modifiers as { name?: string; name_en?: string }[]
                        )
                          .map((mod) => mod.name ?? mod.name_en ?? "")
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-0.5 flex items-start gap-1 text-xs text-miso-600">
                        <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        {item.notes}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-ink-800">
                    {formatPrice(item.line_total)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          <section
            className="washi-panel p-4"
            aria-label={t("admin.pages.orderDetail.ariaCustomerDelivery")}
          >
            <h2 className="font-display text-base font-semibold text-ink-900">
              {t("admin.pages.orderDetail.customerDelivery")}
            </h2>

            <p className="mt-3 text-sm font-medium text-ink-900">
              {order.customer_name ?? t("admin.pages.orderDetail.unnamedCustomer")}
            </p>
            {order.customer_phone ? (
              <a
                href={`tel:${order.customer_phone}`}
                className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-vermilion-600 hover:text-vermilion-700"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {order.customer_phone}
              </a>
            ) : null}

            {address.contact_name || address.contact_phone ? (
              <div className="mt-3 rounded-lg bg-rice-200/60 px-3 py-2">
                <p className="text-2xs font-semibold tracking-wide text-ink-600 uppercase">
                  {t("admin.pages.orderDetail.deliveryContact")}
                </p>
                <p className="mt-0.5 text-sm text-ink-900">
                  {address.contact_name ?? order.customer_name ?? "—"}
                </p>
                {address.contact_phone ? (
                  <a
                    href={`tel:${address.contact_phone}`}
                    className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-vermilion-600 hover:text-vermilion-700"
                  >
                    <Phone className="size-3.5" aria-hidden="true" />
                    {address.contact_phone}
                  </a>
                ) : null}
              </div>
            ) : null}

            <address className="mt-3 flex items-start gap-2 text-sm not-italic text-ink-800">
                <MapPin className="mt-0.5 size-4 shrink-0 text-ink-700/70" aria-hidden="true" />
                <span>
                  {[
                    address.address_line,
                    address.building
                      ? t("admin.pages.orderDetail.building", { value: address.building })
                      : null,
                    address.floor
                      ? t("admin.pages.orderDetail.floor", { value: address.floor })
                      : null,
                    address.apartment
                      ? t("admin.pages.orderDetail.apartment", { value: address.apartment })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  <br />
                  {[address.area, address.city].filter(Boolean).join(", ")}
                  {address.landmark ? (
                    <>
                      <br />
                      <span className="text-ink-700/75">
                        {t("admin.pages.orderDetail.landmark")} {address.landmark}
                      </span>
                    </>
                  ) : null}
                  {address.notes ? (
                    <>
                      <br />
                      <span className="text-ink-700/75">
                        {t("admin.pages.orderDetail.notesPrefix")} {address.notes}
                      </span>
                    </>
                  ) : null}
                </span>
              </address>

            {mapUrl ? (
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-jade-700 hover:text-jade-800"
              >
                <MapPin className="size-4" aria-hidden="true" />
                {t("admin.pages.orderDetail.openPin")}
              </a>
            ) : null}

            {!mapUrl ? (
              <p className="mt-2 text-xs text-ink-700/60">
                {t("admin.pages.orderDetail.noPin")}
              </p>
            ) : null}

            {order.customer_note ? (
              <p className="mt-3 rounded-lg bg-miso-300/25 px-3 py-2 text-sm text-ink-800">
                {t("admin.pages.orderDetail.customerNote")} {order.customer_note}
              </p>
            ) : null}
          </section>

          <section
            className="washi-panel p-4"
            aria-label={t("admin.pages.orderDetail.ariaStatusHistory")}
          >
            <h2 className="font-display text-base font-semibold text-ink-900">
              {t("admin.pages.orderDetail.statusHistory")}
            </h2>
            {order.history.length === 0 ? (
              <p className="mt-2 text-sm text-ink-700/70">
                {t("admin.pages.orderDetail.noHistory")}
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {order.history.map((entry) => (
                  <li key={entry.id} className="flex gap-3 text-sm">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-vermilion-600"
                    />
                    <div>
                      <p className="text-ink-900">
                        {entry.from_status
                          ? `${t(`admin.term.orderStatus.${entry.from_status}`)} → ${t(`admin.term.orderStatus.${entry.to_status}`)}`
                          : t(`admin.term.orderStatus.${entry.to_status}`)}
                      </p>
                      <p className="text-xs text-ink-700/70">
                        {formatDateTime(entry.created_at)}
                        {entry.changed_by_role
                          ? ` · ${t(`admin.term.role.${entry.changed_by_role}`)}`
                          : ""}
                      </p>
                      {entry.note ? (
                        <p className="mt-0.5 text-xs text-ink-800/85">{entry.note}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
