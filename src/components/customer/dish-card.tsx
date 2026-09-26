import Link from "next/link";
import { ArrowRight, Flame, Leaf, Clock, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui/button";
import { StarRating } from "@/components/customer/star-rating";
import { formatPrice, cn } from "@/lib/utils/format";
import { dishImageSrc, dishImageSrcSet } from "@/lib/images/responsive";
import type { MenuItem, MenuRating } from "@/lib/services/catalog";
import type { Locale } from "@/lib/i18n/config";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { en } from "@/lib/i18n/dictionaries/en";
import { makeTranslator } from "@/lib/i18n/translate";

/**
 * Dish card — the product tile the whole customer surface is built from.
 *
 * Composition, top to bottom: a fixed-ratio photo, the dish name, a meta row,
 * then a footer that pairs the rating with the price. Name and price are the
 * two things a hungry reader scans for, so they carry the visual weight rather
 * than being buried in a details list. The whole tile is one link, which makes
 * it a single large touch target on a phone.
 *
 * `onBand` switches to the translucent treatment used on the coloured
 * full-bleed sections, where an opaque white chip would chop the band into
 * disconnected pieces.
 *
 * It stays a server component: translation goes through a local translator
 * rather than a hook, so no card ships a client bundle.
 */
export function DishCard({
  item,
  currency,
  locale = "en",
  categoryName,
  priority = false,
  rating,
  onBand = false,
  className,
}: {
  item: MenuItem;
  currency: string;
  locale?: Locale;
  categoryName?: string;
  priority?: boolean;
  /** Live average from `menu_item_ratings`; omit when the dish is unrated. */
  rating?: MenuRating | null;
  onBand?: boolean;
  className?: string;
}) {
  const t = makeTranslator(locale === "ar" ? ar : en);
  const unavailable = !item.is_available;

  const name = locale === "ar" && item.name_ar?.trim() ? item.name_ar : item.name_en;
  const description =
    locale === "ar" && item.description_ar?.trim()
      ? item.description_ar
      : item.description_en;

  const hasDiscount =
    item.compare_at_price != null && Number(item.compare_at_price) > Number(item.price);

  return (
    <Link
      href={`/menu/${item.slug}`}
      className={cn(
        "dish-card group flex h-full flex-col overflow-hidden",
        onBand && "dish-card-on-band",
        className,
      )}
      aria-label={`${name}, ${formatPrice(item.price, currency, locale)}, ${unavailable ? t("dish.currentlyUnavailable") : t("dish.available")}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {item.image_url ? (
          <img
            src={dishImageSrc(item.image_url, 480)}
            srcSet={dishImageSrcSet(item.image_url)}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            alt={item.image_alt ?? name}
            width={480}
            height={360}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
          />
        ) : (
          /* No photograph yet: the plate keeps the card's shape honest and the
             woven pattern reads as intentional rather than broken. */
          <div
            aria-hidden="true"
            className={cn(
              "asanoha grid h-full place-items-center text-sm",
              onBand ? "text-rice-100/45" : "bg-rice-200/70 text-ink-700/50",
            )}
          >
            {t("common.photoSoon")}
          </div>
        )}

        <div className="absolute start-2.5 top-2.5 flex flex-wrap gap-1.5">
          {item.is_featured ? <Badge tone="indigo">{t("dish.chefPick")}</Badge> : null}
          {unavailable ? <Badge tone="danger">{t("dish.soldOut")}</Badge> : null}
          {hasDiscount ? <Badge tone="success">{t("dish.offer")}</Badge> : null}
        </div>

        {item.prep_minutes ? (
          <span
            className={cn(
              "absolute end-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold backdrop-blur",
              onBand
                ? "bg-ink-950/55 text-rice-50"
                : "bg-rice-50/90 text-ink-800 shadow-washi",
            )}
          >
            <Clock className="size-3" aria-hidden="true" />
            {t("dish.prepMin", { minutes: item.prep_minutes })}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3
          className={cn(
            "font-display text-lg leading-snug font-semibold",
            onBand ? "text-rice-50 group-hover:text-ink-900" : "text-ink-900",
          )}
        >
          {name}
        </h3>

        {description ? (
          <p
            className={cn(
              "mt-1.5 line-clamp-2 text-sm",
              onBand
                ? "text-rice-100/75 group-hover:text-ink-700/85"
                : "text-ink-700/80",
            )}
          >
            {description}
          </p>
        ) : null}

        {/* Diet and provenance chips, capped at three so the row never wraps
            onto a second line and unbalances the grid. */}
        <div
          className={cn(
            "mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs",
            onBand ? "text-rice-100/70 group-hover:text-ink-700/75" : "text-ink-700/75",
          )}
        >
          {categoryName ? <span>{categoryName}</span> : null}
          {item.is_spicy ? (
            <span className="inline-flex items-center gap-1 text-chili-600">
              <Flame className="size-3" aria-hidden="true" /> {t("dish.spicy")}
            </span>
          ) : null}
          {item.is_vegan ? (
            <span className="inline-flex items-center gap-1 text-jade-600">
              <Leaf className="size-3" aria-hidden="true" /> {t("dish.vegan")}
            </span>
          ) : item.is_vegetarian ? (
            <span className="inline-flex items-center gap-1 text-jade-600">
              <Leaf className="size-3" aria-hidden="true" /> {t("dish.vegetarian")}
            </span>
          ) : null}
        </div>

        {/* Footer: rating on the start edge, price on the end edge. `mt-auto`
            pins it down so cards with unequal copy still line up. */}
        <div
          className={cn(
            "mt-auto flex items-end justify-between gap-3 pt-4",
            onBand && "border-t border-rice-100/15 group-hover:border-ink-900/10",
          )}
        >
          <StarRating
            rating={rating}
            tone={onBand ? "onBand" : "onLight"}
            oneLabel={t("dish.ratingCountOne")}
            countLabel={(count) => t("dish.ratingCount", { count })}
            label={
              rating
                ? t("dish.ratingLabel", { rating: rating.average.toFixed(1) })
                : undefined
            }
          />

          <span className="flex flex-col items-end">
            {hasDiscount ? (
              <span
                className={cn(
                  "text-2xs line-through",
                  onBand
                    ? "text-rice-100/60 group-hover:text-ink-700/60"
                    : "text-ink-700/55",
                )}
              >
                {formatPrice(item.compare_at_price!, currency, locale)}
              </span>
            ) : null}
            <span
              className={cn(
                "font-display text-xl font-semibold tabular-nums",
                onBand ? "text-rice-50 group-hover:text-vermilion-700" : "text-ink-900",
              )}
            >
              {formatPrice(item.price, currency, locale)}
            </span>
          </span>
        </div>

        {unavailable ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-chili-600">
            <CircleSlash className="size-3.5" aria-hidden="true" />
            {t("dish.backOnMenu")}
          </p>
        ) : (
          <span
            className={cn(
              "mt-3 inline-flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
              onBand ? "text-rice-50 group-hover:text-vermilion-700" : "text-vermilion-600",
            )}
          >
            {t("dish.viewDish")}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
          </span>
        )}
      </div>
    </Link>
  );
}
