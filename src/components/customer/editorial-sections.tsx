import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils/format";
import type { MenuItem } from "@/lib/services/catalog";
import type { Locale } from "@/lib/i18n/config";

export type EditorialSection = {
  categoryId: string;
  slug: string;
  name: string;
  nameJa: string | null;
  description: string | null;
  items: MenuItem[];
};

/**
 * Editorial rows for the home page: for each published category, a photo
 * plate and a column of dish cards.
 *
 * Every string in here comes from the kitchen's own category record — the name,
 * the Japanese subtitle and the description are whatever the admin typed. There
 * is no per-section marketing copy in the codebase, because inventing it would
 * mean the page describes dishes the kitchen may never have published.
 *
 * Rows alternate which side the photo sits on, and the whole row enters from
 * the side its photo is on, so the page reads as a sequence of spreads rather
 * than a repeated template.
 */
export function EditorialSections({
  sections,
  locale,
}: {
  sections: EditorialSection[];
  locale: Locale;
}) {
  if (sections.length === 0) return null;

  return (
    <div className="space-y-14">
      {sections.map((section, index) => {
        const flipped = index % 2 === 1;
        const hero = section.items[0];
        const rest = section.items.slice(1, 4);

        return (
          <Reveal
            as="section"
            key={section.categoryId}
            variant={flipped ? "right" : "left"}
            aria-labelledby={`editorial-${section.categoryId}`}
            /* `grid-cols-1` rather than a bare `grid`: an implicit grid column
               is `auto`, whose min-content is forced by the `truncate` spans
               below (nowrap text reports its full unwrapped width), which blew
               the column past the viewport on a phone. `grid-cols-1` is
               `minmax(0, 1fr)` and cannot be pushed wider than its container. */
            className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2"
          >
            {/* The photo plate. `order` flips the column on desktop only; on a
                phone the image always leads, which is what a reader expects. */}
            <Link
              href={`/menu/${section.slug}`}
              className={cn(
                "plate group block",
                flipped && "lg:order-2",
              )}
            >
              {hero?.image_url ? (
                <img
                  src={hero.image_url}
                  alt={hero.image_alt ?? hero.name_en}
                  width={720}
                  height={560}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[9/7] w-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="asanoha block aspect-[9/7] w-full bg-rice-200/70"
                />
              )}
            </Link>

            <div className={cn(flipped && "lg:order-1")}>
              <p className="text-xs font-semibold tracking-[0.28em] text-vermilion-600 uppercase">
                {section.nameJa ?? section.name}
              </p>
              <h3
                id={`editorial-${section.categoryId}`}
                className="mt-2 font-display text-fluid-h3 font-semibold text-ink-900"
              >
                {section.name}
              </h3>
              <span aria-hidden="true" className="eyebrow-rule mt-3" />

              {section.description ? (
                <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-700/85">
                  {section.description}
                </p>
              ) : null}

              <ul className="mt-6 space-y-3">
                {rest.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/menu/${item.slug}`}
                      className="group flex items-center gap-4 rounded-xl border border-rice-400/40 bg-white/60 p-2.5 transition-colors hover:border-vermilion-600/35 hover:bg-rose-50"
                    >
                      <span className="plate size-16 shrink-0">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt=""
                            width={128}
                            height={128}
                            loading="lazy"
                            decoding="async"
                            className="size-full object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="asanoha block size-full bg-rice-200/70"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-base font-semibold text-ink-900">
                          {localisedName(item, locale)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-700/70">
                          {localisedDescription(item, locale)}
                        </span>
                      </span>
                      <ArrowRight
                        className="size-4 shrink-0 text-vermilion-600 transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                href={`/menu/${section.slug}`}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-ink-900/12 px-5 py-3 text-sm font-medium text-ink-900 transition-colors hover:border-vermilion-600/40 hover:bg-rose-50"
              >
                {section.name}
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

/**
 * The rotating "Discover" seal that sits over a section junction, the way the
 * reference layout threads its sections together.
 *
 * `aria-hidden` because it is pure decoration and its text repeats the section
 * heading it overlaps.
 */
export function DiscoverSeal({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "seal relative size-24 text-[10px] font-semibold tracking-[0.2em] uppercase",
        className,
      )}
    >
      <svg viewBox="0 0 100 100" className="seal-spin absolute inset-0 size-full">
        <defs>
          <path
            id="seal-arc"
            d="M 50,50 m -34,0 a 34,34 0 1,1 68,0 a 34,34 0 1,1 -68,0"
            fill="none"
          />
        </defs>
        <text className="fill-current text-[11px] tracking-[0.22em]">
          <textPath href="#seal-arc" startOffset="0%">
            {`${label} · ${label} · `}
          </textPath>
        </text>
      </svg>
      <span className="relative size-2 rounded-full bg-vermilion-500" />
    </span>
  );
}

/** The dish's localised name, falling back to English when Arabic is unset. */
function localisedName(item: MenuItem, locale: Locale): string {
  return locale === "ar" && item.name_ar?.trim() ? item.name_ar : item.name_en;
}

/** Same rule for the one-line description. */
function localisedDescription(item: MenuItem, locale: Locale): string {
  return (locale === "ar" && item.description_ar?.trim()
    ? item.description_ar
    : item.description_en) ?? "";
}
