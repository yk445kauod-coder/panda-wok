"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/customer/cart-provider";

type ReorderItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

/**
 * Rebuilds the basket from a past order. Prices come from the order snapshot
 * rather than today's menu, but the checkout page re-prices everything against
 * live data, so a stale price can never be charged.
 */
export function ReorderButton({ items }: { items: ReorderItem[] }) {
  const router = useRouter();
  const { add, hydrated } = useCart();
  const [done, setDone] = useState(false);

  function reorder() {
    for (const item of items) {
      add(
        {
          menuItemId: item.menuItemId,
          slug: "",
          name: item.name,
          nameAr: null,
          unitPrice: item.unitPrice,
          imageUrl: null,
          hasTransparentPng: false,
          modifiers: [],
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
      {done ? "Added to basket" : "Order again"}
    </Button>
  );
}
