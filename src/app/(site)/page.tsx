import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import {
  getFeaturedItems,
  getPublicCategories,
  getPublicMenu,
  getPublicSettings,
  getRestaurant,
} from "@/lib/services/catalog";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLdScript } from "@/components/seo/json-ld";
import { menuSchema } from "@/lib/seo/schema";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { DishCard } from "@/components/customer/dish-card";
import { FeaturedDishStrip } from "@/components/customer/featured-strip";
import { IdentityBand } from "@/components/customer/identity-band";
import { BambooAmbience } from "@/components/customer/bamboo-ambience";
import { AsanohaPanel, BambooRails } from "@/components/customer/asian-frames";
import { LeafField2D } from "@/components/customer/leaf-field-2d";
import { BRAND_LOGO_URL, BRAND_SCRIPT_MARK } from "@/lib/brand";
import { BrandBanner } from "@/components/customer/brand-banner";
import { getLocale, getT } from "@/lib/i18n/server";
import { brandDescription, brandTagline } from "@/lib/i18n/brand";
import type { T } from "@/lib/i18n/server";
import { localiseCategory } from "@/lib/i18n/catalog";

export const dynamic = "force-dynamic";


export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([getPublicSettings(), getLocale()]);
  const t = await getT(locale);
  return buildMetadata({
    // The home title already ends in the brand name, so it opts out of the root
    // layout's `%s | Panda Wok` template; otherwise the brand is printed twice.
    title: {
      absolute: t("home.metaTitle", {
        brand: settings.brand.name,
        tagline: settings.brand.tagline,
      }),
    },
    description: t("home.metaDescription", {
      tagline: settings.brand.tagline,
      brand: settings.brand.name,
      city: settings.brand.city,
    }),
    path: "/",
    keywords: [
      settings.brand.name,
      `food delivery ${settings.brand.city}`,
      `cloud kitchen ${settings.brand.city}`,
    ],
    siteName: settings.brand.name,
    locale,
  });
}

export default async function HomePage() {
  const [featured, categories, menu, settings, restaurant, locale] = await Promise.all([
    getFeaturedItems(6),
    getPublicCategories(),
    getPublicMenu(),
    getPublicSettings(),
    getRestaurant(),
    getLocale(),
  ]);
  const t = await getT(locale);

  const brand = restaurant?.name_en ?? settings.brand.name;
  const currency = restaurant?.currency ?? "EGP";
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // A section is only worth a card if it holds at least one dish. Showing empty
  // sections invites a tap that lands on a blank page, which reads as broken.
  const visibleCategories = categories.filter((category) =>
    menu.items.some((item) => item.category_id === category.id),
  );

  // The live cuisine tags are the honest description of the kitchen ("Japanese-
  // inspired", "Chinese-inspired", …). They are shown verbatim rather than
  // replaced by a slogan, so the page never claims more than the menu supports.
  const cuisineIdentity =
    restaurant?.cuisine_tags && restaurant.cuisine_tags.length > 0
      ? restaurant.cuisine_tags.slice(0, 4).join(" · ")
      : settings.brand.cuisine;

  const menuItems = menu.items.slice(0, 40).map((item) => ({
    slug: item.slug,
    name: item.name_en,
    description: item.description_en,
    price: Number(item.price),
    currency,
    image: item.image_url,
    category:
      categoryById.get(item.category_id)?.name_en ?? t("menu.categoryFallback"),
    available: item.is_available,
    vegetarian: item.is_vegetarian,
    vegan: item.is_vegan,
  }));

  const structured = menuSchema({
    name: `${brand} menu`,
    description: brandDescription(restaurant, locale, settings.brand.tagline),
    url: "/menu",
    items: menuItems,
  });

  return (
    <>
      <Hero
        brand={brand}
        tagline={brandTagline(restaurant, locale, settings.brand.tagline)}
        acceptingOrders={settings.ordering.acceptingOrders}
        hasMenu={menu.items.length > 0}
        logoUrl={BRAND_LOGO_URL}
        locale={locale}
        t={t}
      />

      <IdentityBand
        brand={brand}
        city={settings.brand.city}
        cuisineTags={restaurant?.cuisine_tags ?? []}
        locale={locale}
        t={t}
      />

      {featured.length > 0 ? (
        <section aria-labelledby="featured-heading" className="mx-auto max-w-6xl px-4 py-10">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="featured-heading" className="font-display text-2xl font-semibold text-ink-900 sm:text-3xl">
                  {t("home.featuredHeading")}
                </h2>
                <span aria-hidden="true" className="ink-rule mt-3 block max-w-[5rem]" />
                <p className="mt-3 text-sm text-ink-700/80">
                  {t("home.featuredSubheading")}
                </p>
              </div>
              <Link
                href="/menu"
                className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 sm:inline-flex"
              >
                {t("home.fullMenu")} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
            <FeaturedDishStrip items={featured} currency={currency} locale={locale} />
          </Reveal>
        </section>
      ) : null}
      {visibleCategories.length > 0 ? (
        <section aria-labelledby="categories-heading" className="mx-auto max-w-6xl px-4 py-6">
          <Reveal>
            <h2 id="categories-heading" className="font-display text-2xl font-semibold text-ink-900 sm:text-3xl">
              {t("home.browseBySection")}
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {visibleCategories.map((category, index) => {
                const local = localiseCategory(category, locale);
                const count = menu.items.filter((i) => i.category_id === category.id).length;
                return (
                  <Reveal as="li" key={category.id} delay={Math.min(index, 8) * 40}>
                    <Link
                      href={`/menu/${category.slug}`}
                      className="washi-panel group flex h-full flex-col justify-between p-4 transition-shadow hover:shadow-washi-lg"
                    >
                      <span className="font-display text-base font-semibold text-ink-900">
                        {local.name}
                      </span>
                      {category.name_ja ? (
                        <span className="mt-0.5 text-xs text-ink-700/60" lang="ja">
                          {category.name_ja}
                        </span>
                      ) : null}
                      <span className="mt-3 text-xs text-ink-700/70">
                        {count} {count === 1 ? t("common.dish") : t("common.dishes")}
                      </span>
                    </Link>
                  </Reveal>
                );
              })}
            </ul>
          </Reveal>
        </section>
      ) : null}

      {menu.items.length > 0 ? (
        <section aria-labelledby="popular-heading" className="mx-auto max-w-6xl px-4 py-10">
          <h2 id="popular-heading" className="font-display text-2xl font-semibold text-ink-900 sm:text-3xl">
            {t("home.availableNow")}
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {menu.items
              .filter((item) => item.is_available)
              .slice(0, 9)
              .map((item, index) => (
                <Reveal as="li" key={item.id} delay={Math.min(index, 9) * 45}>
                  <DishCard
                    item={item}
                    currency={currency}
                    locale={locale}
                    categoryName={
                      categoryById.get(item.category_id)
                        ? localiseCategory(categoryById.get(item.category_id)!, locale).name
                        : t("menu.categoryFallback")
                    }
                  />
                </Reveal>
              ))}
          </ul>
          <div className="mt-6 flex justify-center">
            <Link
              href="/menu"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 font-medium text-rice-50 shadow-washi transition-colors hover:bg-indigo-700 sm:w-auto"
            >
              {t("home.seeWholeMenu")} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <EmptyState
            title={t("home.noDishesTitle")}
            description={t("home.noDishesBody")}
            action={
              <Link
                href="/contact"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                {t("common.contactKitchen")}
              </Link>
            }
          />
        </section>
      )}

      <BrandBanner
        brand={brand}
        city={settings.brand.city}
        tagline={brandTagline(restaurant, locale, settings.brand.tagline)}
        cuisine={cuisineIdentity}
        logoUrl={settings.brand.logo_url}
        contact={settings.support}
        t={t}
      />

      <JsonLdScript data={structured} />
    </>
  );
}

function Hero({
  brand,
  tagline,
  acceptingOrders,
  hasMenu,
  logoUrl,
  locale,
  t,
}: {
  brand: string;
  tagline: string;
  acceptingOrders: boolean;
  hasMenu: boolean;
  logoUrl: string;
  locale: string;
  t: T;
}) {
  return (
    <section className="relative overflow-hidden border-b border-ink-900/8 bg-gradient-to-b from-rice-100 via-rice-50 to-rice-100">
      <AsanohaPanel className="opacity-[0.55]" />
      <BambooAmbience locale={locale} />
      <LeafField2D count={30} />
      <BambooRails />
      <div
        aria-hidden="true"
        data-motion="decorative"
        className="pointer-events-none absolute -end-16 -top-20 size-64 rounded-full bg-miso-300/25 blur-2xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:py-20 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          {/* Phones get the mark first, at the top of the page. On desktop the
              ringed plate on the right carries it instead. */}
          <MobileHeroMark logoUrl={logoUrl} brand={brand} />

          <p
            className="font-kana mt-5 text-sm font-semibold tracking-[0.35em] text-indigo-700"
            aria-hidden="true"
          >
            {BRAND_SCRIPT_MARK}
          </p>

          <h1 className="mt-3 max-w-2xl font-display text-4xl leading-[1.05] font-bold text-ink-900 text-balance sm:text-6xl lg:text-7xl">
            {brand}
          </h1>

          <p className="mt-4 max-w-xl text-lg font-medium text-ink-800 text-pretty sm:text-xl">
            {tagline}
          </p>

          <span aria-hidden="true" className="ink-rule mt-5 block max-w-xs" />

          {!acceptingOrders ? (
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-chili-700">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-chili-600" />
              {t("home.closedForOrders")}
            </p>
          ) : null}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/menu"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 font-medium text-rice-50 shadow-washi transition-colors hover:bg-indigo-700"
            >
              {hasMenu ? t("home.startOrder") : t("home.viewMenu")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link
              href="/about"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-900/15 bg-rice-50/70 px-6 font-medium text-ink-900 transition-colors hover:bg-rice-100"
            >
              {t("home.ourStory")}
            </Link>
          </div>
        </div>

        <BambooPlate logoUrl={logoUrl} brand={brand} />
      </div>
    </section>
  );
}

/**
 * The mark at the top of the phone layout.
 *
 * On desktop the logo sits in a large ringed plate to the right of the copy; on
 * a phone there is no room for that, and the logo previously did not appear on
 * the home page at all. This puts it first, above the badges, at a size that
 * reads as a brand mark rather than a favicon — with the logo's own colours on
 * the rice ground, no forced recolouring.
 */
function MobileHeroMark({ logoUrl, brand }: { logoUrl: string; brand: string }) {
  return (
    <div className="mb-5 flex items-center gap-3 lg:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${logoUrl}?tr=w-160,h-160,f-jpg`}
        alt={brand}
        width={160}
        height={160}
        className="size-14 rounded-2xl object-contain"
      />
      <span
        aria-hidden="true"
        className="h-10 w-px bg-gradient-to-b from-transparent via-ink-900/20 to-transparent"
      />
      <span className="font-display text-xl font-semibold tracking-tight text-ink-900">
        {brand}
      </span>
    </div>
  );
}

/** A bamboo-ringed plate holding the real brand mark — the hero's focal art. */
function BambooPlate({ logoUrl, brand }: { logoUrl: string; brand: string }) {
  return (
    <div
      aria-hidden="true"
      data-motion="decorative"
      className="relative mx-auto hidden aspect-square w-full max-w-sm place-items-center lg:grid"
    >
      <span className="absolute inset-0 rounded-full border border-bamboo-600/25" />
      <span className="asanoha absolute inset-4 rounded-full opacity-60" />
      <span className="absolute inset-10 rounded-full border border-dashed border-ink-900/15" />
      <span className="absolute inset-16 rounded-full bg-rice-50/80 shadow-washi-lg" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${logoUrl}?tr=w-512,h-512,f-jpg`}
        alt=""
        width={512}
        height={512}
        className="relative size-40 rounded-2xl object-contain shadow-washi-lg"
      />
    </div>
  );
}
