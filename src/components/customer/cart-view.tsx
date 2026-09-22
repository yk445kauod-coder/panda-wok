"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useCart } from "@/components/customer/cart-provider";
import { computeTotals, type CheckoutConfig } from "@/lib/services/checkout-math";
import { formatPrice } from "@/lib/utils/format";

/**
 * Basket review. Totals shown here are a preview only: the same arithmetic is
 * recomputed on the server inside place_order, which is the authoritative
 * figure.
 */
export function CartView({
  config,
  acceptingOrders,
}: {
  config: CheckoutConfig;
  acceptingOrders: boolean;
}) {
  const { lines, hydrated, setQuantity, remove, subtotal, itemCount, priceOf } = useCart();

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6" aria-busy="true">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-rice-200" />
        <div className="mt-4 space-y-3">
          {[0, 1].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-washi bg-rice-200/70" />
          ))}
        </div>
        <span className="sr-only">Loading your basket</span>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-ink-900">Your basket</h1>
        <EmptyState
          className="mt-4"
          title="Your basket is empty"
          description="Add a few dishes and they will appear here. Your basket is saved on this device, so it survives a refresh."
          action={
            <Link
              href="/menu"
              className="inline-flex h-11 items-center rounded-xl bg-plum-600 px-5 text-sm font-medium text-rice-50 hover:bg-plum-700"
            >
              Browse the menu
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
        Your basket
        <span className="ml-2 text-base font-normal text-ink-700/70">
          {itemCount} {itemCount === 1 ? "item" : "items"}
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
                <Image
                  src={line.imageUrl}
                  alt={line.name}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <span aria-hidden="true" className="seigaiha block h-full w-full" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/menu/${line.slug}`}
                    className="block truncate font-medium text-ink-900 hover:text-plum-600"
                  >
                    {line.name}
                  </Link>
                  {line.modifiers.length > 0 ? (
                    <p className="mt-0.5 text-xs text-ink-700/70">
                      {line.modifiers.map((m) => m.name).join(", ")}
                    </p>
                  ) : null}
                  {line.notes ? (
                    <p className="mt-0.5 text-xs italic text-ink-700/60">
                      “{line.notes}”
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink-900">
                  {formatPrice(priceOf(line))}
                </span>
              </div>

              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center rounded-lg border border-ink-900/12">
                  <button
                    type="button"
                    onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                    aria-label={`Reduce ${line.name} quantity`}
                    className="grid size-9 place-items-center text-ink-800"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="min-w-7 text-center text-sm tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
                    disabled={line.quantity >= Math.min(line.maxQuantity || 20, 20)}
                    aria-label={`Increase ${line.name} quantity`}
                    className="grid size-9 place-items-center text-ink-800 disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => remove(line.menuItemId)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-chili-600 hover:bg-chili-500/8"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section aria-labelledby="summary-heading" className="washi-panel mt-5 p-4">
        <h2 id="summary-heading" className="text-sm font-semibold text-ink-900">
          Summary
        </h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-700/85">Subtotal</dt>
            <dd className="tabular-nums">{formatPrice(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700/85">Delivery</dt>
            <dd className="tabular-nums">
              {totals.deliveryFee === 0 ? "Free" : formatPrice(totals.deliveryFee)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700/85">
              Tax
              <span className="ml-1 text-xs text-ink-700/60">
                ({Math.round(config.taxRate * 100)}%)
              </span>
            </dt>
            <dd className="tabular-nums">{formatPrice(totals.tax)}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-ink-900/8 pt-2.5 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPrice(totals.total)}</dd>
          </div>
        </dl>

        {subtotal < config.freeDeliveryOver && totals.deliveryFee > 0 ? (
          <p className="mt-3 rounded-lg bg-jade-500/10 px-3 py-2 text-xs text-jade-600">
            Add {formatPrice(config.freeDeliveryOver - subtotal)} more for free delivery.
          </p>
        ) : null}

        {belowMinimum ? (
          <p
            role="status"
            className="mt-3 flex items-start gap-1.5 rounded-lg bg-miso-500/15 px-3 py-2 text-xs text-miso-600"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Minimum order is {formatPrice(config.minOrderTotal)}. Add{" "}
            {formatPrice(config.minOrderTotal - subtotal)} more to check out.
          </p>
        ) : null}

        {!acceptingOrders ? (
          <p
            role="status"
            className="mt-3 flex items-start gap-1.5 rounded-lg bg-chili-500/10 px-3 py-2 text-xs text-chili-600"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            The kitchen is not accepting new orders at the moment. You can still keep your
            basket and try again shortly.
          </p>
        ) : null}

        {belowMinimum || !acceptingOrders ? (
          <Button className="mt-4 w-full" size="lg" disabled>
            Go to checkout
          </Button>
        ) : (
          <Link
            href="/checkout"
            className="mt-4 inline-flex h-13 w-full items-center justify-center rounded-xl bg-plum-600 font-medium text-rice-50 shadow-washi transition-colors hover:bg-plum-700"
          >
            Go to checkout
          </Link>
        )}

        <p className="mt-3 text-center text-[11px] text-ink-700/60">
          Prices, availability and stock are confirmed on the server when the order is
          placed.
        </p>
      </section>

      <div className="mt-4 flex justify-center">
        <Link
          href="/menu"
          className="text-sm font-medium text-plum-600 hover:text-plum-700"
        >
          Add more dishes
        </Link>
      </div>
    </div>
  );
}
