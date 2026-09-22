import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils/format";
import type { MenuItem } from "@/lib/services/catalog";

/**
 * Horizontally scrollable featured strip. On a phone this is a natural swipe
 * gesture; on desktop it becomes a centred row.
 */
export function FeaturedDishStrip({
  items,
  currency,
}: {
  items: MenuItem[];
  currency: string;
}) {
  void currency;

  return (
    <ul
      className="no-scrollbar -mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      aria-label="Featured dishes"
    >
      {items.map((item) => (
        <li
          key={item.id}
          className="w-[68vw] max-w-xs shrink-0 snap-start sm:w-64"
        >
          <Link
            href={`/menu/${item.slug}`}
            className="washi-panel group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-washi-lg"
          >
            <div className="relative aspect-[5/3] overflow-hidden bg-rice-200">
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.image_alt ?? item.name_en}
                  fill
                  sizes="(max-width: 640px) 68vw, 256px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <div aria-hidden="true" className="seigaiha h-full w-full" />
              )}
              {item.has_transparent_png ? (
                <span className="absolute bottom-2 right-2">
                  <Badge tone="info">Cut-out ready</Badge>
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col justify-between p-3.5">
              <div>
                <h3 className="font-display text-base font-semibold text-ink-900">
                  {item.name_en}
                </h3>
                {item.description_en ? (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-700/80">
                    {item.description_en}
                  </p>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-semibold text-ink-900">
                {formatPrice(item.price)}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
