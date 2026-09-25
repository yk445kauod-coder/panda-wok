"use client";

import Link from "next/link";
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useCart } from "@/components/customer/cart-provider";
import { useSound } from "@/components/sound-provider";
import { dishImageSrc } from "@/lib/images/responsive";
import { useT } from "@/components/i18n-provider";
import { computeTotals, type CheckoutConfig } from "@/lib/services/checkout-math";
import { formatPrice } from "@/lib/utils/format";
import type { Locale } from "@/lib/i18n/config";

/**
 * Basket review. Totals shown here are a preview only: the same arithmetic is
 * recomputed on the server inside place_order, which is the authoritative
 * figure.
 */
export function CartView({
  config,
  acceptingOrders,
  locale = "en",
}: {
  config: CheckoutConfig;
  acceptingOrders: boolean;
  locale?: Locale;
}) {
  const t = useT();
  const { lines, hydrated, setQuantity, remove, subtotal, itemCount, priceOf } = useCart();
  const { play } = useSound();

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6" aria-busy="true">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-rice-200" />
        <div className="mt-4 space-y-3">
          {[0, 1].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-washi bg-rice-200/70" />
          ))}
        </div>
        <span className="sr-only">{t("common.loadingBasket")}</span>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-ink-900">{t("cart.title")}</h1>
        <EmptyState
          className="mt-4"
          title={t("cart.emptyTitle")}
          description={t("cart.emptyBody")}
          action={
            <Link
              href="/menu"
              className="inline-flex h-11 items-center rounded-xl bg-indigo-600 px-5 text-sm font-medium text-rice-50 hover:bg-indigo-700"
            >
              {t("common.browseMenu")}
            </Link>
          }
        />
      </div>
    );
  }

  const totals = computeTotals(subtotal, { fulfillment: "delivery", config });
  const belowMinimum = subtotal < config.minOrderTotal;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink-900">
        {t("cart.title")}
        <span className="ms-2 text-base font-normal text-ink-700/70">
          {itemCount === 1
            ? t("cart.itemCountSingular", { count: itemCount })
            : t("cart.itemCountPlural", { count: itemCount })}
        </span>
      </h1>

      <ul className="mt-5 space-y-3">
        {lines.map((line) => (
          <li
            key={`${line.menuItemId}-${line.modifiers.map((m) => m.id).join("-")}`}
            className="washi-panel flex gap-3 p-3"
          >
            <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-rice-200">
              {line.imageUrl ? (
                <img
                  src={dishImageSrc(line.imageUrl, 160)}
                  alt={line.name}
                  width={160}
                  height={120}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <span aria-hidden="true" className="asanoha block h-full w-full" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/menu/${line.slug}`}
                    className="block truncate font-medium text-ink-900 hover:text-indigo-600"
                  >
                    {line.name}
                  </Link>
                  {line.modifiers.length > 0 ? (
                    <ul className="mt-0.5 space-y-0.5">
                      {line.modifiers.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-2 text-xs text-ink-700/70"
                        >
                          <span className="min-w-0 truncate">{m.name}</span>
                          {m.priceDelta !== 0 ? (
                            <span className="shrink-0 tabular-nums text-ink-700/60">
                              {m.priceDelta > 0 ? "+" : ""}
                              {formatPrice(m.priceDelta, undefined, locale)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {line.notes ? (
                    <p className="mt-0.5 text-xs italic text-ink-700/60">
                      “{line.notes}”
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink-900">
                  {formatPrice(priceOf(line), undefined, locale)}
                </span>
              </div>

              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center rounded-lg border border-ink-900/12">
                  <button
                    type="button"
                    onClick={() => {
                      setQuantity(line.menuItemId, line.quantity - 1);
                      play("remove");
                    }}
                    aria-label={t("cart.reduceQuantity", { name: line.name })}
                    className="grid size-9 place-items-center text-ink-800"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="min-w-7 text-center text-sm tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setQuantity(line.menuItemId, line.quantity + 1);
                      play("tap");
                    }}
                    disabled={line.quantity >= Math.min(line.maxQuantity || 20, 20)}
                    aria-label={t("cart.increaseQuantity", { name: line.name })}
                    className="grid size-9 place-items-center text-ink-800 disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    remove(line.menuItemId);
                    play("remove");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-chili-600 hover:bg-chili-500/8"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  {t("common.remove")}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section aria-labelledby="summary-heading" className="washi-panel mt-5 p-4">
        <h2 id="summary-heading" className="text-sm font-semibold text-ink-900">
          {t("cart.summary")}
        </h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-700/85">{t("cart.subtotal")}</dt>
            <dd className="tabular-nums">{formatPrice(totals.subtotal, undefined, locale)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700/85">{t("cart.delivery")}</dt>
            <dd className="tabular-nums">
              {totals.deliveryFee === 0
                ? t("common.free")
                : formatPrice(totals.deliveryFee, undefined, locale)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700/85">
              {t("cart.tax")}
              <span className="ms-1 text-xs text-ink-700/60">
                ({Math.round(config.taxRate * 100)}%)
              </span>
            </dt>
            <dd className="tabular-nums">{formatPrice(totals.tax, undefined, locale)}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-ink-900/8 pt-2.5 text-base font-semibold">
            <dt>{t("cart.total")}</dt>
            <dd className="tabular-nums">{formatPrice(totals.total, undefined, locale)}</dd>
          </div>
        </dl>

        {subtotal < config.freeDeliveryOver && totals.deliveryFee > 0 ? (
          <p className="mt-3 rounded-lg bg-jade-500/10 px-3 py-2 text-xs text-jade-600">
            {t("cart.freeDeliveryHint", {
              amount: formatPrice(config.freeDeliveryOver - subtotal, undefined, locale),
            })}
          </p>
        ) : null}

        {belowMinimum ? (
          <p
            role="status"
            className="mt-3 flex items-start gap-1.5 rounded-lg bg-miso-500/15 px-3 py-2 text-xs text-miso-600"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t("cart.minimumHint", {
              minimum: formatPrice(config.minOrderTotal, undefined, locale),
              amount: formatPrice(config.minOrderTotal - subtotal, undefined, locale),
            })}
          </p>
        ) : null}

        {!acceptingOrders ? (
          <p
            role="status"
            className="mt-3 flex items-start gap-1.5 rounded-lg bg-chili-500/10 px-3 py-2 text-xs text-chili-600"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t("cart.notAccepting")}
          </p>
        ) : null}

        {belowMinimum || !acceptingOrders ? (
          <Button className="mt-4 w-full" size="lg" disabled>
            {t("cart.goToCheckout")}
          </Button>
        ) : (
          <Link
            href="/checkout"
            className="mt-4 inline-flex h-13 w-full items-center justify-center rounded-xl bg-indigo-600 font-medium text-rice-50 shadow-washi transition-colors hover:bg-indigo-700"
          >
            {t("cart.goToCheckout")}
          </Link>
        )}

        <p className="mt-3 text-center text-[11px] text-ink-700/60">
          {t("common.priceNote")}
        </p>
      </section>

      <div className="mt-4 flex justify-center">
        <Link href="/menu" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          {t("cart.addMore")}
        </Link>
      </div>
    </div>
  );
}
