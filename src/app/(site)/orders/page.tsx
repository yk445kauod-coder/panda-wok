import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getMyOrders } from "@/lib/services/orders";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/button";
import { isActive, type OrderStatus } from "@/lib/services/order-status";
import { formatDateTime, formatPrice } from "@/lib/utils/format";
import { getLocale, getT } from "@/lib/i18n/server";
import {
  fulfilmentLabel,
  statusLabel,
} from "@/lib/i18n/orders";
import type { Locale } from "@/lib/i18n/config";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { en } from "@/lib/i18n/dictionaries/en";
import { makeTranslator } from "@/lib/i18n/translate";
import { getPublicSettings, getRestaurant } from "@/lib/services/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, settings] = await Promise.all([getLocale(), getPublicSettings()]);
  const t = await getT(locale);
  return buildMetadata({
    title: t("orders.metaTitle"),
    description: t("orders.metaDescription", { brand: settings.brand.name }),
    path: "/orders",
    noIndex: true,
    locale,
  });
}

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in?next=%2Forders");

  const [orders, locale, restaurant] = await Promise.all([
    getMyOrders(session.user.id, 30),
    getLocale(),
    getRestaurant(),
  ]);
  const t = await getT(locale);
  const brand = restaurant?.name_en ?? "Panda Wok";

  const active = orders.filter((o) => isActive(o.status));
  const past = orders.filter((o) => !isActive(o.status));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink-900">{t("orders.title")}</h1>
      <p className="mt-1 text-sm text-ink-700/80">
        {t("orders.subtitle", { brand })}
      </p>

      {orders.length === 0 ? (
        <EmptyState
          className="mt-5"
          title={t("orders.emptyTitle")}
          description={t("orders.emptyBody")}
          action={
            <Link
              href="/menu"
              className="inline-flex h-11 items-center rounded-xl bg-plum-600 px-5 text-sm font-medium text-rice-50 hover:bg-plum-700"
            >
              {t("common.browseMenu")}
            </Link>
          }
        />
      ) : (
        <>
          {active.length > 0 ? (
            <section aria-labelledby="active-heading" className="mt-6">
              <h2
                id="active-heading"
                className="text-sm font-semibold uppercase tracking-wide text-ink-700/70"
              >
                {t("orders.inProgress")}
              </h2>
              <ul className="mt-3 space-y-3">
                {active.map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} locale={locale} live />
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
              <h2
                id="past-heading"
                className="text-sm font-semibold uppercase tracking-wide text-ink-700/70"
              >
                {t("orders.history")}
              </h2>
              <ul className="mt-3 space-y-3">
                {past.map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} locale={locale} />
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
  locale,
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
  locale: Locale;
  live?: boolean;
}) {
  const failed = ["canceled", "rejected", "failed", "refunded"].includes(order.status);
  const t = translatorFor(locale);

  return (
    <Link
      href={`/orders/${order.id}`}
      className="washi-panel block p-4 transition-shadow hover:shadow-washi-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink-900">#{order.order_number}</p>
          <p className="mt-0.5 text-xs text-ink-700/70">
            {formatDateTime(order.created_at, locale)} ·{" "}
            {fulfilmentLabel(order.fulfillment, locale)}
          </p>
        </div>
        <Badge tone={failed ? "danger" : isActive(order.status) ? "info" : "success"}>
          {statusLabel(order.status, locale)}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-ink-700/85">
          {order.item_count === 1
            ? t("orders.itemCountSingular", { count: order.item_count })
            : t("orders.itemCountPlural", { count: order.item_count })}
        </span>
        <span className="font-semibold text-ink-900">
          {formatPrice(order.total, undefined, locale)}
        </span>
      </div>

      {live ? (
        <p className="mt-2 text-xs text-ink-700/65">{t("orders.openLive")}</p>
      ) : null}
    </Link>
  );
}

/** Small synchronous helper so the row component stays free of async work. */
function translatorFor(locale: Locale) {
  const dict = locale === "ar" ? ar : en;
  return makeTranslator(dict);
}
