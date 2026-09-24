import { Reveal } from "@/components/ui/reveal";
import type { T } from "@/lib/i18n/server";

/**
 * The Asian-identity band on the home page.
 *
 * It names the two traditions the kitchen actually cooks from — a Japanese
 * sushi counter and a Chinese wok — because the menu elements are real (the
 * categories carry `name_ja`, the story mentions "one wok station and one sushi
 * counter"). Nothing here is invented cuisine: the script glyphs are the
 * language names, not a claim about a dish.
 *
 * The circulating wave (`seigaiha`) already used in the hero is reused as the
 * shared Asian motif, drawn from the design system rather than a new asset.
 */
export function IdentityBand({
  brand,
  city,
  t,
}: {
  brand: string;
  city: string;
  t: T;
}) {
  const pillars = [
    {
      script: t("home.identityJapaneseScript"),
      scriptLang: "ja" as const,
      label: t("home.identityJapaneseLabel"),
      body: t("home.identityJapaneseBody"),
    },
    {
      script: t("home.identityChineseScript"),
      scriptLang: "zh-Hans" as const,
      label: t("home.identityChineseLabel"),
      body: t("home.identityChineseBody"),
    },
  ];

  return (
    <section
      aria-labelledby="identity-heading"
      className="relative overflow-hidden border-y border-ink-900/8 bg-ink-900 text-rice-50"
    >
      <div
        aria-hidden="true"
        data-motion="decorative"
        className="seigaiha pointer-events-none absolute inset-0 opacity-[0.18]"
      />
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

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {pillars.map((pillar, index) => (
            <Reveal as="li" key={pillar.label} delay={index * 80}>
              <div className="flex h-full items-start gap-4 rounded-2xl border border-rice-50/12 bg-rice-50/5 p-5 backdrop-blur-sm">
                <span
                  lang={pillar.scriptLang}
                  aria-hidden="true"
                  className="grid size-14 shrink-0 place-items-center rounded-xl bg-miso-300/15 font-display text-2xl font-semibold text-miso-300"
                >
                  {pillar.script}
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-rice-50">
                    {pillar.label}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-rice-100/80">
                    {pillar.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
