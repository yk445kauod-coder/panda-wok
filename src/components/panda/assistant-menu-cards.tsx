"use client";

import Link from "next/link";
import { Flame, Leaf, CircleSlash, ArrowRight } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils/format";
import { dishImageSrc, dishImageSrcSet } from "@/lib/images/responsive";
import { useI18n } from "@/components/i18n-provider";
import type { AssistantMenuCard } from "@/lib/ai/menu-cards";

/**
 * A dish card shown inside the assistant chat.
 *
 * It renders a row that was selected server-side from the live menu, so the
 * photo, name and price are always real — the model never writes them. The card
 * is deliberately close to `DishCard` in spirit but shrunk for a 26rem sheet:
 * a square thumbnail, the name, a one-line description and the price.
 */
export function AssistantMenuCards({ cards }: { cards: AssistantMenuCard[] }) {
  const { locale } = useI18n();

  if (cards.length === 0) return null;

  return (
    <ul className="mt-2 space-y-2">
      {cards.map((card) => {
        const name = locale === "ar" && card.nameAr ? card.nameAr : card.name;
        return (
          <li key={card.slug}>
            <Link
              href={`/menu/${card.slug}`}
              className="group flex gap-3 rounded-xl border border-ink-900/10 bg-rice-50 p-2 transition hover:border-miso-500/40 hover:bg-rice-100"
            >
              <span className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-rice-200">
                {card.imageUrl ? (
                  // Remote menu images are served unoptimised, exactly as the
                  // menu page does; the srcSet is tuned by width.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={dishImageSrc(card.imageUrl, 160)}
                    srcSet={dishImageSrcSet(card.imageUrl, [160, 240, 320])}
                    sizes="64px"
                    alt={card.imageAlt}
                    loading="lazy"
                    decoding="async"
                    width={160}
                    height={160}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="asanoha grid size-full place-items-center text-[10px] text-ink-700/45">
                    {card.category}
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink-900">
                    {name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-vermilion-600">
                    {formatPrice(card.price, "EGP", locale)}
                  </span>
                </span>

                {card.description ? (
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-ink-700/75">
                    {card.description}
                  </span>
                ) : null}

                <span className="mt-1 flex items-center gap-2 text-[10px] text-ink-700/65">
                  {card.spicy ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Flame className="size-3 text-chili-500" aria-hidden="true" />
                    </span>
                  ) : null}
                  {card.vegan || card.vegetarian ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Leaf className="size-3 text-bamboo-600" aria-hidden="true" />
                      {card.vegan ? "Vegan" : "Vegetarian"}
                    </span>
                  ) : null}
                  {card.containsNuts ? (
                    <span className="inline-flex items-center gap-0.5">
                      <CircleSlash className="size-3" aria-hidden="true" />
                      Nuts
                    </span>
                  ) : null}
                  {!card.available ? (
                    <span className="text-chili-600">Unavailable right now</span>
                  ) : null}
                  <span
                    className={cn(
                      "ms-auto inline-flex items-center gap-0.5 font-medium text-miso-700",
                    )}
                  >
                    View
                    <ArrowRight className="size-3 rtl:rotate-180" aria-hidden="true" />
                  </span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
