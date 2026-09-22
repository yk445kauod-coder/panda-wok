import Link from "next/link";
import Image from "next/image";
import { Flame, Leaf, Clock, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils/format";
import type { MenuItem } from "@/lib/services/catalog";

/**
 * Dish card. It is a plain link so the whole card is one large touch target,
 * and the image uses a fixed aspect ratio to avoid layout shift.
 */
export function DishCard({
  item,
  currency,
  categoryName,
  priority = false,
}: {
  item: MenuItem;
  currency: string;
  categoryName?: string;
  priority?: boolean;
}) {
  const unavailable = !item.is_available;

  return (
    <Link
      href={`/menu/${item.slug}`}
      className="washi-panel group flex flex-col overflow-hidden transition-shadow hover:shadow-washi-lg"
      aria-label={`${item.name_en}, ${formatPrice(item.price, currency)}, ${unavailable ? "currently unavailable" : "available"}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-rice-200">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.image_alt ?? item.name_en}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            aria-hidden="true"
            className="seigaiha grid h-full place-items-center bg-rice-200/70 text-sm text-ink-700/50"
          >
            Photo coming soon
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {item.is_featured ? <Badge tone="plum">Chef&apos;s pick</Badge> : null}
          {unavailable ? <Badge tone="danger">Sold out</Badge> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-snug text-ink-900">
            {item.name_en}
          </h3>
          <span className="shrink-0 text-sm font-semibold text-ink-900">
            {formatPrice(item.price, currency)}
          </span>
        </div>

        {item.name_ja ? (
          <p className="mt-0.5 text-xs text-ink-700/60" lang="ja">
            {item.name_ja}
          </p>
        ) : null}

        {item.description_en ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-ink-700/80">
            {item.description_en}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-700/75">
          {categoryName ? <span>{categoryName}</span> : null}
          {item.prep_minutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {item.prep_minutes}m
            </span>
          ) : null}
          {item.is_spicy ? (
            <span className="inline-flex items-center gap-1 text-chili-600">
              <Flame className="size-3" aria-hidden="true" /> Spicy
            </span>
          ) : null}
          {item.is_vegan ? (
            <span className="inline-flex items-center gap-1 text-jade-600">
              <Leaf className="size-3" aria-hidden="true" /> Vegan
            </span>
          ) : item.is_vegetarian ? (
            <span className="inline-flex items-center gap-1 text-jade-600">
              <Leaf className="size-3" aria-hidden="true" /> Vegetarian
            </span>
          ) : null}
        </div>

        {unavailable ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-chili-600">
            <CircleSlash className="size-3.5" aria-hidden="true" />
            Back on the menu soon
          </p>
        ) : null}
      </div>
    </Link>
  );
}
