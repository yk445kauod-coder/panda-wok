"use client";

import Link from "next/link";
import { Pencil, Power, Trash2 } from "lucide-react";
import { deleteOfferAction, toggleOfferAction } from "@/lib/actions/admin";
import { AdminButtonAction } from "@/components/admin/form-kit";
import { Badge } from "@/components/ui/button";
import { cn, formatPrice } from "@/lib/utils/format";
import type { Database } from "@/lib/types/database";

export type OfferRow = Database["public"]["Tables"]["offers"]["Row"];

/** Human summary of what an offer does, so the list reads without opening it. */
function describe(offer: OfferRow): string {
  const reward =
    offer.kind === "percent"
      ? `${offer.value}% off${offer.max_discount != null ? ` (max ${formatPrice(offer.max_discount)})` : ""}`
      : `${formatPrice(offer.value)} off`;
  const condition =
    Number(offer.threshold) > 0
      ? `baskets from ${formatPrice(offer.threshold)}`
      : "every basket";
  return `${reward} on ${condition}.`;
}

/**
 * Offer list. The enabled state is toggled inline because pausing a promotion
 * is the common action and it should not require an edit round trip.
 */
export function OfferList({ offers }: { offers: OfferRow[] }) {
  return (
    <ul className="space-y-2">
      {offers.map((offer) => (
        <li key={offer.id} className="washi-panel p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">
                  {offer.name_en}
                </span>
                {offer.is_enabled ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="neutral">Paused</Badge>
                )}
                <Badge tone="indigo">
                  {offer.kind === "percent" ? "Percentage" : "Flat"}
                </Badge>
              </div>

              <p className="mt-1 text-xs text-ink-800">{describe(offer)}</p>
              {offer.name_ar ? (
                <p className="mt-0.5 text-xs text-ink-700/70" dir="rtl" lang="ar">
                  {offer.name_ar}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <AdminButtonAction
                action={() => toggleOfferAction(offer.id, !offer.is_enabled)}
                variant="ghost"
                size="sm"
                confirm={
                  offer.is_enabled
                    ? `Pause “${offer.name_en}”? It stops applying at checkout immediately.`
                    : `Activate “${offer.name_en}”? It starts applying at checkout immediately.`
                }
              >
                <Power className="size-3.5" aria-hidden="true" />
                {offer.is_enabled ? "Pause" : "Activate"}
              </AdminButtonAction>
              <Link
                href={`/admin/offers?edit=${offer.id}`}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-900/15",
                  "bg-rice-50/70 px-3 text-sm font-medium text-ink-900 hover:bg-rice-100",
                )}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit
              </Link>
              <AdminButtonAction
                action={() => deleteOfferAction(offer.id)}
                variant="ghost"
                size="sm"
                confirm={`Delete “${offer.name_en}”? Orders already placed keep the discount they were given.`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </AdminButtonAction>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
