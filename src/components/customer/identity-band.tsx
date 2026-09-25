import { Reveal } from "@/components/ui/reveal";
import { BambooAmbience } from "@/components/customer/bamboo-ambience";
import { BRAND_SCRIPT_MARK } from "@/lib/brand";
import type { T } from "@/lib/i18n/server";

/**
 * The Asian-identity band on the home page.
 *
 * Every word here comes from the database. `cuisineTags` is the kitchen's own
 * description of what it cooks, so the band renders those tags verbatim instead
 * of a slogan the code invented — if the kitchen changes its tags, this section
 * changes with it, and it can never claim a cuisine the menu does not carry.
 *
 * The script mark is the same glyph the rest of the brand surfaces use, so the
 * band stays on-brand without a separate artistic claim.
 */
export function IdentityBand({
  brand,
  city,
  cuisineTags,
  t,
  locale,
}: {
  brand: string;
  city: string;
  cuisineTags: string[];
  t: T;
  locale?: string;
}) {
  const tags = cuisineTags.filter((tag) => tag.trim().length > 0);
  if (tags.length === 0) return null;

  return (
    <section
      aria-labelledby="identity-heading"
      className="relative overflow-hidden border-y border-ink-900/8 bg-ink-900 text-rice-50"
    >
      <div
        aria-hidden="true"
        data-motion="decorative"
        className="asanoha-light pointer-events-none absolute inset-0 opacity-[0.5]"
      />
      <BambooAmbience locale={locale} density="full" />
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <Reveal>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-miso-300">
            {t("home.identitySig", { brand, city })}
          </p>
          <h2
            id="identity-heading"
            className="mt-3 max-w-2xl text-fluid-h2 font-semibold"
          >
            {t("home.identityHeading")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-rice-100/85 sm:text-base">
            {t("home.identityBody")}
          </p>
        </Reveal>

        <ul className="mt-8 flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <Reveal as="li" key={tag} delay={Math.min(index, 8) * 60}>
              <span className="inline-flex items-center gap-2 rounded-full border border-rice-50/12 bg-rice-50/5 px-4 py-2 text-sm text-rice-100/90">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-miso-300"
                />
                {tag}
              </span>
            </Reveal>
          ))}
        </ul>

        <p
          aria-hidden="true"
          className="mt-8 font-kana text-2xl tracking-[0.4em] text-rice-50/25"
        >
          {BRAND_SCRIPT_MARK}
        </p>
      </div>
    </section>
  );
}
