import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { getPageContent } from "@/lib/services/content";
import { breadcrumbSchema, organisationSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Badge } from "@/components/ui/button";
import { getLocale, getT } from "@/lib/i18n/server";
import {
  brandDescription,
  brandName,
  brandTagline,
  localisedPlace,
} from "@/lib/i18n/brand";

export const dynamic = "force-dynamic";


export async function generateMetadata(): Promise<Metadata> {
  const [settings, restaurant, locale] = await Promise.all([
    getPublicSettings(),
    getRestaurant(),
    getLocale(),
  ]);
  const t = await getT(locale);
  const cuisine = (restaurant?.cuisine_tags ?? []).filter(
    (tag): tag is string => typeof tag === "string",
  );
  return buildMetadata({
    title: t("about.metaTitle", { brand: settings.brand.name }),
    description: t("about.metaDescription", {
      brand: settings.brand.name,
      cuisine: cuisine.slice(0, 3).join(", ") || settings.brand.cuisine,
      city: localisedPlace(settings.brand.city, locale),
      country: localisedPlace(settings.brand.country, locale),
    }),
    path: "/about",
    siteName: settings.brand.name,
  });
}

/**
 * The about page reads its long-form copy from `page_content` when staff have
 * entered it, and falls back to the dictionary otherwise. That keeps the page
 * whole before the table is populated and after it is edited, and the identical
 * section keys mean an edit replaces exactly the block it names.
 */
export default async function AboutPage() {
  const locale = await getLocale();
  const [settings, restaurant, t, sections] = await Promise.all([
    getPublicSettings(),
    getRestaurant(),
    getT(locale),
    getPageContent("about", locale),
  ]);

  const copy = new Map(sections.map((section) => [section.sectionKey, section]));
  const heading = (key: string, fallback: string) =>
    copy.get(key)?.heading?.trim() || fallback;
  const body = (key: string, fallback: string) =>
    copy.get(key)?.body?.trim() || fallback;

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

  const structured = [
    organisationSchema({
      name: brand,
      social: settings.support.social,
    }),
    breadcrumbSchema([
      { name: t("nav.home"), path: "/" },
      { name: t("nav.about"), path: "/about" },
    ]),
  ];

  return (
    <article className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("nav.home"), path: "/" },
          { name: t("nav.about"), path: "/about" },
        ]}
      />

      <header className="mt-4 flex items-start gap-4">
        <BrandLogo brand={settings.brand} className="mt-1 size-14 shrink-0" />
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
            {t("about.title", { brand })}
          </h1>
          <p className="mt-1.5 text-sm text-ink-700/85">
            {tagline}
          </p>
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
      </header>

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
            area: restaurant?.area
              ? `${localisedPlace(restaurant.area, locale)}, `
              : "",
            city: localisedPlace(restaurant?.city ?? settings.brand.city, locale),
            country: localisedPlace(
              restaurant?.country ?? settings.brand.country,
              locale,
            ),
          })}
        </p>
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/menu"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-6 font-medium text-rice-50 hover:bg-indigo-700 sm:flex-1"
        >
          {t("about.seeMenu")}
        </Link>
        <Link
          href="/contact"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-900/15 px-6 font-medium text-ink-900 hover:bg-rice-200 sm:flex-1"
        >
          {t("about.contactUs")}
        </Link>
      </div>

      <JsonLdScript data={structured} />
    </article>
  );
}

