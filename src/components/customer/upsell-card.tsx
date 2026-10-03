"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useCart } from "@/components/customer/cart-provider";
import { useT } from "@/components/i18n-provider";
import { trackEvent } from "@/components/customer/analytics-beacon";
import { dishImageSrc } from "@/lib/images/responsive";
import { formatPrice } from "@/lib/utils/format";
import type { MenuItem } from "@/lib/services/catalog";
import type { Locale } from "@/lib/i18n/config";

/** Compact one-tap add row used inside the upsell list. */
export function UpsellCard({
  item,
  headline,
  currency,
  locale = "en",
}: {
  item: MenuItem;
  headline: string | null;
  currency: string;
  locale?: Locale;
}) {
  const t = useT();
  const { add, lines, hydrated } = useCart();
  const [added, setAdded] = useState(false);

  const name = locale === "ar" && item.name_ar?.trim() ? item.name_ar : item.name_en;

  const inCart = hydrated ? lines.some((line) => line.menuItemId === item.id) : false;

  function handleAdd() {
    add({
      menuItemId: item.id,
      slug: item.slug,
      name,
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
          <img
            src={dishImageSrc(item.image_url, 128)}
            alt={item.image_alt ?? name}
            width={128}
            height={96}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span aria-hidden="true" className="asanoha block h-full w-full" />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/menu/${item.slug}`} className="block">
          <span className="block truncate text-sm font-medium text-ink-900">{name}</span>
        </Link>
        {headline ? (
          <span className="block truncate text-xs text-ink-700/70">{headline}</span>
        ) : null}
        <span className="block text-xs font-semibold text-ink-800">
          {formatPrice(item.price, currency, locale)}
        </span>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-vermilion-600/25 bg-vermilion-600/8 px-3 text-xs font-semibold text-vermilion-600 transition-colors hover:bg-vermilion-600/15"
      >
        {added || inCart ? (
          <>
            <Check className="size-3.5" aria-hidden="true" />
            {added ? t("addToCart.added") : t("common.inBasket")}
          </>
        ) : (
          <>
            <Plus className="size-3.5" aria-hidden="true" />
            {t("common.add")}
          </>
        )}
      </button>
    </div>
  );
}
