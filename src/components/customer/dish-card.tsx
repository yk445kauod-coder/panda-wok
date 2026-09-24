import Link from "next/link";
import { Flame, Leaf, Clock, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils/format";
import { dishImageSrc, dishImageSrcSet } from "@/lib/images/responsive";
import type { MenuItem } from "@/lib/services/catalog";
import type { Locale } from "@/lib/i18n/config";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { en } from "@/lib/i18n/dictionaries/en";
import { makeTranslator } from "@/lib/i18n/translate";

/**
 * Dish card. It is a plain link so the whole card is one large touch target,
 * and the image uses a fixed aspect ratio to avoid layout shift. It is a server
 * component, so it translates with a local translator rather than a hook.
 */
export function DishCard({
  item,
  currency,
  locale = "en",
  categoryName,
  priority = false,
}: {
  item: MenuItem;
  currency: string;
  locale?: Locale;
  categoryName?: string;
  priority?: boolean;
}) {
  const t = makeTranslator(locale === "ar" ? ar : en);
  const unavailable = !item.is_available;

  const name = locale === "ar" && item.name_ar?.trim() ? item.name_ar : item.name_en;
  const description =
    locale === "ar" && item.description_ar?.trim()
      ? item.description_ar
      : item.description_en;

  return (
    <Link
      href={`/menu/${item.slug}`}
      className="washi-panel group flex flex-col overflow-hidden transition-shadow hover:shadow-washi-lg"
      aria-label={`${name}, ${formatPrice(item.price, currency, locale)}, ${unavailable ? t("dish.currentlyUnavailable") : t("dish.available")}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-rice-200">
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
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            aria-hidden="true"
            className="seigaiha grid h-full place-items-center bg-rice-200/70 text-sm text-ink-700/50"
          >
            {t("common.photoSoon")}
          </div>
        )}

        <div className="absolute start-2 top-2 flex flex-wrap gap-1">
          {item.is_featured ? <Badge tone="plum">{t("dish.chefPick")}</Badge> : null}
          {unavailable ? <Badge tone="danger">{t("dish.soldOut")}</Badge> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-snug text-ink-900">
            {name}
          </h3>
          <span className="shrink-0 text-sm font-semibold text-ink-900">
            {formatPrice(item.price, currency, locale)}
          </span>
        </div>

        {description ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-ink-700/80">{description}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-700/75">
          {categoryName ? <span>{categoryName}</span> : null}
          {item.prep_minutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {t("dish.prepMin", { minutes: item.prep_minutes })}
            </span>
          ) : null}
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

        {unavailable ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-chili-600">
            <CircleSlash className="size-3.5" aria-hidden="true" />
            {t("dish.backOnMenu")}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
