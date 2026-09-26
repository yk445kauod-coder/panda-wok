"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { DishCard } from "@/components/customer/dish-card";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils/format";
import type { MenuItem, MenuRating } from "@/lib/services/catalog";

export type PopularItem = {
  item: MenuItem;
  categoryName: string;
  categoryId: string;
};

/**
 * The "popular right now" band: a filter row over a grid of dish cards.
 *
 * Filtering happens on the client from a server-rendered list rather than by
 * fetching, so switching a category is instant and the whole menu stays in the
 * DOM for search engines. It is a client component only because of that state —
 * every card inside is still the server-rendered `DishCard` markup.
 *
 * The filter row is a radio group, not a set of buttons: arrow keys move
 * between pills and the selection is announced, which a row of `<button>`s with
 * `aria-pressed` does not do as cleanly.
 */
export function PopularMenu({
  items,
  categories,
  currency,
  locale,
  ratings,
  onBand = false,
}: {
  items: PopularItem[];
  categories: { id: string; name: string }[];
  currency: string;
  locale: "en" | "ar";
  ratings: Record<string, MenuRating>;
  /** Renders the pills and empty state for a coloured band. */
  onBand?: boolean;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<string>("all");

  const visible = useMemo(
    () =>
      active === "all"
        ? items
        : items.filter((entry) => entry.categoryId === active),
    [active, items],
  );

  const filters = [
    { id: "all", label: t("home.popularFilterAll") },
    ...categories.map((category) => ({ id: category.id, label: category.name })),
  ];

  return (
    <div>
      {/* The filter row scrolls horizontally on a phone rather than wrapping
          into three lines that push the first dish below the fold. */}
      <div
        role="radiogroup"
        aria-label={t("home.browseBySection")}
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {filters.map((filter) => {
          const selected = filter.id === active;
          return (
            <button
              key={filter.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setActive(filter.id)}
              className={cn(
                "shrink-0 snap-start",
                onBand ? "pill pill-on-band" : "pill",
                selected && "pill-active",
              )}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p
          className={cn(
            "py-10 text-center text-sm",
            onBand ? "text-rice-100/80" : "text-ink-700/75",
          )}
        >
          {t("home.editorialEmptyList")}
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((entry, index) => (
            <Reveal
              as="li"
              key={entry.item.id}
              delay={Math.min(index, 6) * 55}
              variant="zoom"
            >
              <DishCard
                item={entry.item}
                currency={currency}
                locale={locale}
                categoryName={entry.categoryName}
                rating={ratings[entry.item.id] ?? null}
                onBand={onBand}
                priority={index < 3}
              />
            </Reveal>
          ))}
        </ul>
      )}

      <div className="mt-8 flex justify-center">
        <Link
          href="/menu"
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-7 font-medium shadow-washi transition-colors",
            onBand
              ? "bg-rice-50 text-vermilion-700 hover:bg-white"
              : "bg-vermilion-600 text-rice-50 hover:bg-vermilion-700",
          )}
        >
          {t("home.popularExplore")}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
