"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useCart } from "@/components/customer/cart-provider";
import { trackEvent } from "@/components/customer/analytics-beacon";
import { formatPrice } from "@/lib/utils/format";
import type { MenuItem } from "@/lib/services/catalog";

/** Compact one-tap add row used inside the upsell list. */
export function UpsellCard({
  item,
  headline,
  currency,
}: {
  item: MenuItem;
  headline: string | null;
  currency: string;
}) {
  void currency;

  const { add, lines, hydrated } = useCart();
  const [added, setAdded] = useState(false);

  const inCart = hydrated
    ? lines.some((line) => line.menuItemId === item.id)
    : false;

  function handleAdd() {
    add({
      menuItemId: item.id,
      slug: item.slug,
      name: item.name_en,
      nameAr: item.name_ar,
      unitPrice: Number(item.price),
      imageUrl: item.image_url,
      hasTransparentPng: item.has_transparent_png,
      modifiers: [],
      maxQuantity: 20,
    });

    trackEvent("CART_ADD", {
      menu_item_id: item.id,
      slug: item.slug,
      quantity: 1,
      source: "upsell",
    });

    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-900/10 bg-rice-50/80 p-2.5">
      <Link
        href={`/menu/${item.slug}`}
        className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-rice-200"
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.image_alt ?? item.name_en}
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <span aria-hidden="true" className="seigaiha block h-full w-full" />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/menu/${item.slug}`} className="block">
          <span className="block truncate text-sm font-medium text-ink-900">
            {item.name_en}
          </span>
        </Link>
        {headline ? (
          <span className="block truncate text-xs text-ink-700/70">{headline}</span>
        ) : null}
        <span className="block text-xs font-semibold text-ink-800">
          {formatPrice(item.price)}
        </span>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-plum-600/25 bg-plum-600/8 px-3 text-xs font-semibold text-plum-600 transition-colors hover:bg-plum-600/15"
      >
        {added || inCart ? (
          <>
            <Check className="size-3.5" aria-hidden="true" />
            {added ? "Added" : "In basket"}
          </>
        ) : (
          <>
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </>
        )}
      </button>
    </div>
  );
}
