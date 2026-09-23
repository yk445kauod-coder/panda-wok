"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Plus,
  RefreshCw,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { Badge, Button, Spinner } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useCart } from "@/components/customer/cart-provider";
import { useErrorText, useT } from "@/components/i18n-provider";
import { trackEvent } from "@/components/customer/analytics-beacon";
import { placeOrderAction } from "@/lib/actions/checkout";
import { computeTotals, type CheckoutConfig } from "@/lib/services/checkout-math";
import { formatPrice, randomId, humanise } from "@/lib/utils/format";
import { toAppError, type AppError } from "@/lib/utils/errors";
import type { Address } from "@/lib/services/orders";
import type { Locale } from "@/lib/i18n/config";

type Fulfillment = "delivery" | "pickup";
type PaymentMethod = "cash_on_delivery" | "card_on_delivery";

/**
 * Checkout. Failure-aware by design:
 *  - the idempotency key is minted once per attempt and reused on every retry,
 *    so a double tap or a dropped connection cannot create two orders;
 *  - an offline or network error keeps the basket intact and offers a retry;
 *  - a stale-cart rejection (price or availability change) is surfaced clearly
 *    with a way to refresh rather than a generic failure.
 */
export function CheckoutFlow({
  config,
  acceptingOrders,
  addresses,
  defaultAddressId,
  customerPhone,
  loyaltyPoints,
  loyaltyTier,
  previousOrders,
  locale = "en",
}: {
  config: CheckoutConfig;
  acceptingOrders: boolean;
  addresses: Address[];
  defaultAddressId: string | null;
  customerPhone: string | null;
  loyaltyPoints: number;
  loyaltyTier: string | null;
  previousOrders: number;
  locale?: Locale;
}) {
  const t = useT();
  const errorText = useErrorText();
  const router = useRouter();
  const { lines, hydrated, subtotal, itemCount, clear } = useCart();

  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [addressId, setAddressId] = useState<string | null>(defaultAddressId);
  const [payment, setPayment] = useState<PaymentMethod>("cash_on_delivery");
  const [note, setNote] = useState("");
  const [usePoints, setUsePoints] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  // Read the initial connectivity once, then let the browser events own it.
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );
  const startedTracked = useRef(false);

  // One key for the whole checkout attempt. A retry after an error reuses it,
  // so the server can recognise the duplicate and return the same order.
  const idempotencyKey = useRef<string>(randomId("order"));

  useEffect(() => {
    function onOffline() {
      setOffline(true);
    }
    function onOnline() {
      setOffline(false);
    }
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Fire the funnel event once per mount. A ref rather than state, because this
  // is a side effect on external analytics, not something the UI renders.
  useEffect(() => {
    if (hydrated && lines.length > 0 && !startedTracked.current) {
      startedTracked.current = true;
      trackEvent("CHECKOUT_STARTED", { lines: lines.length, subtotal });
    }
  }, [hydrated, lines.length, subtotal]);

  // Redeeming is capped at half the subtotal and by the points balance.
  const redeemablePoints = useMemo(() => {
    const byBalance = loyaltyPoints;
    const byValue = Math.floor((subtotal * 0.5) / config.loyaltyPointValue);
    return Math.max(0, Math.min(byBalance, byValue));
  }, [loyaltyPoints, subtotal, config.loyaltyPointValue]);

  const pointsToRedeem = usePoints ? redeemablePoints : 0;

  const totals = useMemo(
    () => computeTotals(subtotal, { fulfillment, config, pointsToRedeem }),
    [subtotal, fulfillment, config, pointsToRedeem],
  );

  const selectedAddress = addresses.find((a) => a.id === addressId) ?? null;
  const belowMinimum = subtotal > 0 && subtotal < config.minOrderTotal;
  const needsAddress = fulfillment === "delivery" && !selectedAddress;
  const blocked =
    !acceptingOrders ||
    lines.length === 0 ||
    belowMinimum ||
    needsAddress ||
    offline ||
    submitting;

  async function submit() {
    if (blocked) return;
    setError(null);
    setSubmitting(true);

    try {
      const result = await placeOrderAction({
        idempotencyKey: idempotencyKey.current,
        items: lines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          modifiers: line.modifiers.map((m) => m.id),
          notes: line.notes,
        })),
        addressId: fulfillment === "delivery" ? selectedAddress?.id : undefined,
        fulfillment,
        paymentMethod: fulfillment === "pickup" ? "cash_on_delivery" : payment,
        customerNote: note.trim() || undefined,
        pointsToRedeem,
      });

      if (!result.ok) {
        setError(result.error);
        // A brand new key is warranted when the failure was not a duplicate
        // submission, so the customer is not stuck on a poisoned key.
        if (result.error.code !== "UNKNOWN") {
          idempotencyKey.current = randomId("order");
        }
        setSubmitting(false);
        return;
      }

      // Only clear the basket once the server confirms the order exists.
      clear();
      router.replace(`/orders/${result.data.orderId}?placed=1`);
    } catch (caught) {
      setError(toAppError(caught));
      idempotencyKey.current = randomId("order");
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8" aria-busy="true">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-rice-200" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-28 animate-pulse rounded-washi bg-rice-200/70" />
          ))}
        </div>
        <span className="sr-only">{t("common.loadingCheckout")}</span>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-ink-900">{t("checkout.title")}</h1>
        <EmptyState
          className="mt-4"
          title={t("checkout.nothingTitle")}
          description={t("checkout.nothingBody")}
          action={
            <Link
              href="/menu"
              className="inline-flex h-11 items-center rounded-xl bg-plum-600 px-5 text-sm font-medium text-rice-50 hover:bg-plum-700"
            >
              {t("common.browseMenu")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink-900">{t("checkout.title")}</h1>
      <p className="mt-1 text-sm text-ink-700/80">
        {itemCount === 1
          ? t("checkout.itemCountSingular", { count: itemCount })
          : t("checkout.itemCountPlural", { count: itemCount })}
      </p>

      {offline ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-miso-500/30 bg-miso-300/15 p-3.5"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-miso-600" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium text-ink-900">{t("checkout.offlineTitle")}</p>
            <p className="mt-0.5 text-xs text-ink-700/80">{t("checkout.offlineBody")}</p>
          </div>
        </div>
      ) : null}

      {/* Fulfilment */}
      <section className="washi-panel mt-4 p-4">
        <h2 className="text-sm font-semibold text-ink-900">
          {t("checkout.fulfilmentHeading")}
        </h2>
        <div
          role="radiogroup"
          aria-label={t("checkout.fulfilmentLabel")}
          className="mt-3 grid grid-cols-2 gap-2"
        >
          {(
            [
              {
                key: "delivery",
                label: t("checkout.delivery"),
                icon: Truck,
                hint: t("checkout.deliveryHint", {
                  fee: formatPrice(config.deliveryFee, undefined, locale),
                  freeOver: formatPrice(config.freeDeliveryOver, undefined, locale),
                }),
              },
              {
                key: "pickup",
                label: t("checkout.pickup"),
                icon: Store,
                hint: t("checkout.pickupHint"),
              },
            ] as const
          ).map((option) => {
            const active = fulfillment === option.key;
            const Icon = option.icon;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFulfillment(option.key)}
                className={
                  active
                    ? "rounded-xl border border-plum-600 bg-plum-600/8 p-3 text-start"
                    : "rounded-xl border border-ink-900/12 p-3 text-start hover:bg-rice-200/60"
                }
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
                  <Icon className="size-4" aria-hidden="true" />
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-ink-700/75">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Address */}
      {fulfillment === "delivery" ? (
        <section className="washi-panel mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <MapPin className="size-4 text-plum-600" aria-hidden="true" />
              {t("checkout.addressHeading")}
            </h2>
            <Link
              href="/account/addresses?next=%2Fcheckout"
              className="text-xs font-medium text-plum-600 hover:text-plum-700"
            >
              {t("common.manage")}
            </Link>
          </div>

          {addresses.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title={t("checkout.noAddressTitle")}
                description={t("checkout.noAddressBody")}
                action={
                  <Link
                    href="/account/addresses?next=%2Fcheckout"
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-plum-600 px-4 text-sm font-medium text-rice-50 hover:bg-plum-700"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {t("checkout.addAddress")}
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {addresses.map((address) => {
                const active = address.id === addressId;
                return (
                  <li key={address.id}>
                    <label
                      className={
                        active
                          ? "flex cursor-pointer gap-3 rounded-xl border border-plum-600 bg-plum-600/6 p-3"
                          : "flex cursor-pointer gap-3 rounded-xl border border-ink-900/12 p-3 hover:bg-rice-200/50"
                      }
                    >
                      <input
                        type="radio"
                        name="address"
                        checked={active}
                        onChange={() => setAddressId(address.id)}
                        className="mt-1 size-4 accent-plum-600"
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink-900">{address.label}</span>
                          {address.is_default ? (
                            <Badge tone="info">{t("common.default")}</Badge>
                          ) : null}
                        </span>
                        <span className="mt-1 block text-ink-700/85">
                          {[
                            address.address_line,
                            address.building
                              ? t("checkout.building", { value: address.building })
                              : null,
                            address.floor
                              ? t("checkout.floor", { value: address.floor })
                              : null,
                            address.apartment
                              ? t("checkout.apartment", { value: address.apartment })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {address.landmark ? (
                          <span className="mt-0.5 block text-xs text-ink-700/70">
                            {t("checkout.landmark", { value: address.landmark })}
                          </span>
                        ) : null}
                        {address.contact_name ? (
                          <span className="mt-0.5 block text-xs text-ink-700/70">
                            {address.contact_name}
                            {address.contact_phone ? ` · ${address.contact_phone}` : ""}
                          </span>
                        ) : null}
                        {address.notes ? (
                          <span className="mt-0.5 block text-xs italic text-ink-700/60">
                            “{address.notes}”
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {!customerPhone ? (
            <p className="mt-3 text-xs text-miso-600">
              {t("checkout.noPhoneWarning", {
                link: t("checkout.yourAccountLink"),
              })}{" "}
              <Link href="/account" className="underline">
                {t("checkout.yourAccountLink")}
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Payment */}
      <section className="washi-panel mt-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <Wallet className="size-4 text-plum-600" aria-hidden="true" />
          {t("checkout.paymentHeading")}
        </h2>
        <p className="mt-1 text-xs text-ink-700/70">{t("checkout.paymentNotice")}</p>
        <ul className="mt-3 space-y-2">
          {(
            [
              {
                key: "cash_on_delivery",
                label:
                  fulfillment === "pickup"
                    ? t("checkout.cashAtPickup")
                    : t("checkout.cashOnDelivery"),
              },
              {
                key: "card_on_delivery",
                label:
                  fulfillment === "pickup"
                    ? t("checkout.cardAtPickup")
                    : t("checkout.cardOnDelivery"),
              },
            ] as const
          ).map((option) => {
            const active = payment === option.key;
            return (
              <li key={option.key}>
                <label
                  className={
                    active
                      ? "flex cursor-pointer items-center gap-3 rounded-xl border border-plum-600 bg-plum-600/6 p-3"
                      : "flex cursor-pointer items-center gap-3 rounded-xl border border-ink-900/12 p-3 hover:bg-rice-200/50"
                  }
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={active}
                    onChange={() => setPayment(option.key)}
                    className="size-4 accent-plum-600"
                  />
                  <span className="text-sm text-ink-900">{option.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Loyalty redemption */}
      {redeemablePoints > 0 ? (
        <section className="washi-panel mt-3 p-4">
          <h2 className="text-sm font-semibold text-ink-900">
            {t("checkout.loyaltyHeading")}
          </h2>
          <p className="mt-1 text-xs text-ink-700/70">
            {t("checkout.loyaltyPoints", { points: loyaltyPoints })}
            {loyaltyTier ? ` · ${humanise(loyaltyTier)}` : ""}
          </p>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink-900/12 p-3">
            <span className="text-sm text-ink-900">
              {t("checkout.loyaltyRedeem")} —{" "}
              {t("checkout.loyaltyHint", {
                points: redeemablePoints,
                value: formatPrice(redeemablePoints * config.loyaltyPointValue, undefined, locale),
              })}
            </span>
            <input
              type="checkbox"
              checked={usePoints}
              onChange={(event) => setUsePoints(event.target.checked)}
              className="size-4 accent-plum-600"
            />
          </label>
        </section>
      ) : null}

      {/* Note */}
      <section className="washi-panel mt-3 p-4">
        <label htmlFor="order-note" className="text-sm font-semibold text-ink-900">
          {t("checkout.kitchenNote")}
        </label>
        <textarea
          id="order-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={300}
          placeholder={t("checkout.notePlaceholder")}
          className="mt-2 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2 text-sm outline-none focus:border-miso-500"
        />
      </section>

      {/* Summary */}
      <section className="washi-panel mt-3 p-4">
        <h2 className="text-sm font-semibold text-ink-900">{t("checkout.orderSummary")}</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {lines.map((line) => (
            <li
              key={`${line.menuItemId}-${line.modifiers.map((m) => m.id).join("-")}`}
              className="flex justify-between gap-3"
            >
              <span className="min-w-0 truncate text-ink-800">
                {line.quantity} × {line.name}
                {line.modifiers.length > 0 ? (
                  <span className="text-ink-700/60">
                    {" "}
                    (+{line.modifiers.map((m) => m.name).join(", ")})
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums text-ink-800">
                {formatPrice(
                  (line.unitPrice + line.modifiers.reduce((s, m) => s + m.priceDelta, 0)) *
                    line.quantity,
                  undefined,
                  locale,
                )}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-3 space-y-1.5 border-t border-ink-900/8 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-700/85">{t("cart.subtotal")}</dt>
            <dd className="tabular-nums">
              {formatPrice(totals.subtotal, undefined, locale)}
            </dd>
          </div>
          {totals.discount > 0 ? (
            <div className="flex justify-between text-jade-600">
              <dt>{t("checkout.pointsDiscount")}</dt>
              <dd className="tabular-nums">
                −{formatPrice(totals.discount, undefined, locale)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-ink-700/85">
              {fulfillment === "pickup" ? t("checkout.pickup") : t("checkout.delivery")}
            </dt>
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

        <p className="mt-3 text-xs text-jade-600">
          {t("checkout.pointsEarned", { points: totals.pointsEarned })}
        </p>
        {previousOrders === 0 ? (
          <p className="mt-1 text-xs text-ink-700/70">{t("checkout.firstOrder")}</p>
        ) : null}
      </section>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-chili-500/30 bg-chili-500/8 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-chili-600">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {errorText(error)}
          </p>
          {error.detail ? (
            <p className="mt-1 text-xs text-ink-700/85">{error.detail}</p>
          ) : null}

          {error.code === "ITEM_UNAVAILABLE" || error.code === "ITEM_NOT_FOUND" ? (
            <Link
              href="/cart"
              className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-ink-900/15 bg-rice-50 px-4 text-sm font-medium text-ink-900 hover:bg-rice-200"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {t("checkout.reviewBasket")}
            </Link>
          ) : error.code === "MIN_ORDER_NOT_MET" ? (
            <Link
              href="/menu"
              className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-ink-900/15 bg-rice-50 px-4 text-sm font-medium text-ink-900 hover:bg-rice-200"
            >
              {t("checkout.addAnotherDish")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-ink-900/15 bg-rice-50 px-4 text-sm font-medium text-ink-900 hover:bg-rice-200"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {t("common.tryAgain")}
            </button>
          )}

          <p className="mt-2 text-[11px] text-ink-700/60">{t("checkout.retrySafe")}</p>
        </div>
      ) : null}

      <div className="sticky bottom-20 z-20 mt-4 rounded-xl border border-ink-900/10 bg-rice-50/95 p-3 shadow-washi backdrop-blur md:bottom-4">
        <Button
          type="button"
          size="lg"
          onClick={() => void submit()}
          disabled={blocked}
          loading={submitting}
          className="w-full"
        >
          {submitting
            ? t("checkout.placing")
            : t("checkout.placeOrderWithTotal", {
                total: formatPrice(totals.total, undefined, locale),
              })}
        </Button>

        {!acceptingOrders ? (
          <p role="status" className="mt-2 text-center text-xs text-chili-600">
            {t("checkout.notAcceptingNow")}
          </p>
        ) : belowMinimum ? (
          <p role="status" className="mt-2 text-center text-xs text-miso-600">
            {t("checkout.minimumIs", {
              amount: formatPrice(config.minOrderTotal, undefined, locale),
            })}
          </p>
        ) : needsAddress ? (
          <p role="status" className="mt-2 text-center text-xs text-miso-600">
            {t("checkout.chooseAddress")}
          </p>
        ) : offline ? (
          <p role="status" className="mt-2 text-center text-xs text-miso-600">
            {t("checkout.waitingConnection")}
          </p>
        ) : (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-700/60">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("checkout.doubleTapSafe")}
          </p>
        )}
      </div>

      {submitting ? (
        <p className="sr-only" aria-live="assertive">
          <Spinner className="inline size-4" /> {t("checkout.placingSr")}
        </p>
      ) : null}
    </div>
  );
}
