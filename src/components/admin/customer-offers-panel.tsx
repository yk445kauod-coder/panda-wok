"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Badge } from "@/components/ui/button";
import { OfferForm } from "@/components/admin/offer-form";
import { deleteOfferAction, toggleOfferAction } from "@/lib/actions/admin";
import { AdminButtonAction } from "@/components/admin/form-kit";
import { formatPrice } from "@/lib/utils/format";
import type { OfferRow } from "@/components/admin/offer-list";

/**
 * The promotions targeted at one customer. Creating one here fixes the target
 * to this person, so the offer can never accidentally reach the whole book.
 */
export function CustomerOffersPanel({
  customerId,
  customerName,
  offers,
}: {
  customerId: string;
  customerName: string;
  offers: OfferRow[];
}) {
  const [creating, setCreating] = useState(false);

  return (
    <section className="washi-panel p-4" aria-label="Customer offers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink-900">
          Offers for {customerName}
        </h2>
        {creating ? null : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add an offer
          </Button>
        )}
      </div>

      {offers.length === 0 && !creating ? (
        <p className="mt-2 text-sm text-ink-700/70">
          No offer targets this customer yet. A targeted offer shows only in
          their checkout.
        </p>
      ) : null}

      {offers.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {offers.map((offer) => (
            <li
              key={offer.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-900/10 p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink-900">
                    {offer.name_en}
                  </span>
                  {offer.is_enabled ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Paused</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-700/75">
                  {offer.kind === "percent"
                    ? `${offer.value}% off`
                    : `${formatPrice(offer.value)} off`}
                  {Number(offer.threshold) > 0
                    ? ` from ${formatPrice(offer.threshold)}`
                    : " on every basket"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <AdminButtonAction
                  action={() => toggleOfferAction(offer.id, !offer.is_enabled)}
                  variant="ghost"
                  size="sm"
                >
                  {offer.is_enabled ? "Pause" : "Activate"}
                </AdminButtonAction>
                <AdminButtonAction
                  action={() => deleteOfferAction(offer.id)}
                  variant="ghost"
                  size="sm"
                  confirm="Delete this offer permanently?"
                >
                  Delete
                </AdminButtonAction>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {creating ? (
        <div className="mt-4 border-t border-ink-900/10 pt-4">
          <OfferForm
            offer={null}
            fixedCustomerId={customerId}
            fixedCustomerName={customerName}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setCreating(false)}
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </section>
  );
}
