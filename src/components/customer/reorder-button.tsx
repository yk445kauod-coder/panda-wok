"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/customer/cart-provider";
import { useT } from "@/components/i18n-provider";

type ReorderModifier = { id: string; name: string; priceDelta: number };

type ReorderItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  /** Base price only; modifier deltas are added per selection. */
  unitPrice: number;
  modifiers: ReorderModifier[];
};

/**
 * Rebuilds the basket from a past order. The line's chosen modifiers are copied
 * across: a dish whose single-select group is required (a size, a base) is
 * rejected by `place_order` when the line carries no choice, so dropping them
 * here would produce a basket that can never be submitted. Prices come from the
 * order snapshot rather than today's menu, but checkout re-prices everything
 * against live data, so a stale price can never be charged.
 */
export function ReorderButton({ items }: { items: ReorderItem[] }) {
  const t = useT();
  const router = useRouter();
  const { add, hydrated } = useCart();
  const [done, setDone] = useState(false);

  function reorder() {
    for (const item of items) {
      // The stored unit price already includes the modifier deltas, so subtract
      // them back out to recover the base the cart expects; `priceOf` re-adds
      // them from `modifiers`.
      const modifierDelta = item.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
      add(
        {
          menuItemId: item.menuItemId,
          slug: "",
          name: item.name,
          nameAr: null,
          unitPrice: Math.max(0, Math.round((item.unitPrice - modifierDelta) * 100) / 100),
          imageUrl: null,
          hasTransparentPng: false,
          modifiers: item.modifiers,
          maxQuantity: 20,
        },
        item.quantity,
      );
    }
    setDone(true);
    router.push("/cart");
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 sm:flex-1"
      disabled={!hydrated || done || items.length === 0}
      onClick={reorder}
    >
      <RotateCcw className="size-4" aria-hidden="true" />
      {done ? t("orders.reorderAdded") : t("orders.reorder")}
    </Button>
  );
}
