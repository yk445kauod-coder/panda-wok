"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { useLocalePath } from "@/components/i18n-hooks";
import { usePublicData } from "@/lib/public/client";
import { useStore } from "@/components/customer/store-data";
import { PageLoading } from "@/components/ui/page-states";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Reveal } from "@/components/ui/reveal";
import { Badge } from "@/components/ui/button";
import { brandDescription, brandName, brandTagline, localisedPlace } from "@/lib/i18n/brand";
import type { PageSection } from "@/lib/services/content";

/**
 * About, rendered from the client store plus the page copy endpoint.
 *
 * The long-form copy is owner-editable (`page_content`); when a section has no
 * row the coded dictionary text stands in, exactly as the server page did. Both
 * reads are client-side now, so the Worker serves a constant document.
 */
export function AboutPage() {
  const { t } = useI18n();
  const lp = useLocalePath();
  const { data, loading, error } = useStore();
  const { data: content } = usePublicData<{ sections: PageSection[] }>(
    "/api/public/content",
    { page: "about", locale: data?.locale },
  );

  if (loading && !data) return <PageLoading />;
  if (!data) return null;

  const { settings, restaurant, locale } = data;
  const copy = new Map((content?.sections ?? []).map((s) => [s.sectionKey, s]));
  const heading = (key: string, fallback: string) => copy.get(key)?.heading?.trim() || fallback;
  const body = (key: string, fallback: string) => copy.get(key)?.body?.trim() || fallback;

  const brand = brandName(restaurant, locale, settings.brand.name);
  const tagline = brandTagline(restaurant, locale, t("about.fallbackTagline"));
  const description = brandDescription(
    restaurant,
    locale,
    t("about.fallbackDescription", {
      brand,
      city: localisedPlace(settings.brand.city, locale),
    }),
  );
  const cuisine = (restaurant?.cuisine_tags ?? []).filter(
    (tag): tag is string => typeof tag === "string",
  );

  return (
    <article className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("nav.home"), path: "/" },
          { name: t("nav.about"), path: "/about" },
        ]}
      />

      <Reveal className="mt-4 flex items-start gap-4">
        <BrandLogo brand={settings.brand} className="mt-1 size-14 shrink-0" />
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
            {t("about.title", { brand })}
          </h1>
          <p className="mt-1.5 text-sm text-ink-700/85">{tagline}</p>
          {cuisine.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {cuisine.map((tag) => (
                <li key={tag}>
                  <Badge tone="indigo">{tag}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Reveal>

      <Reveal delay={80}>
        <section className="prose-panda mt-6 space-y-4 text-sm leading-relaxed text-ink-800">
          <p>{description}</p>

          <h2 className="font-display text-lg font-semibold text-ink-900">
            {heading("story", t("about.cloudKitchenHeading"))}
          </h2>
          <p>{body("story", t("about.cloudKitchenBody"))}</p>

          <h2 className="font-display text-lg font-semibold text-ink-900">
            {heading("how_we_cook", t("about.howWeCookHeading"))}
          </h2>
          <p>{body("how_we_cook", t("about.howWeCookBody"))}</p>

          <h2 className="font-display text-lg font-semibold text-ink-900">
            {heading("identity", t("about.identityHeading"))}
          </h2>
          <p>{body("identity", t("about.identityBody"))}</p>
          {cuisine.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {cuisine.map((tag) => (
                <li key={tag}>
                  <Badge tone="info">{tag}</Badge>
                </li>
              ))}
            </ul>
          ) : null}

          <h2 className="font-display text-lg font-semibold text-ink-900">
            {heading("allergens", t("about.allergensHeading"))}
          </h2>
          <p>{body("allergens", t("about.allergensBody"))}</p>

          <h2 className="font-display text-lg font-semibold text-ink-900">
            {t("about.whereHeading")}
          </h2>
          <p>
            {t("about.whereBody", {
              area: restaurant?.area ? `${localisedPlace(restaurant.area, locale)}, ` : "",
              city: localisedPlace(restaurant?.city ?? settings.brand.city, locale),
              country: localisedPlace(restaurant?.country ?? settings.brand.country, locale),
            })}
          </p>
        </section>
      </Reveal>

      <Reveal delay={140}>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={lp("/menu")}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-vermilion-600 px-6 font-medium text-rice-50 hover:bg-vermilion-700 sm:flex-1"
          >
            {t("about.seeMenu")}
          </Link>
          <Link
            href={lp("/contact")}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-900/15 px-6 font-medium text-ink-900 hover:bg-rice-200 sm:flex-1"
          >
            {t("about.contactUs")}
          </Link>
        </div>
      </Reveal>
      {error ? null : null}
    </article>
  );
}
