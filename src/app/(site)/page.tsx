import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Clock, Leaf, Sparkles } from "lucide-react";
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
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { formatPrice } from "@/lib/utils/format";
import { DishCard } from "@/components/customer/dish-card";
import { FeaturedDishStrip } from "@/components/customer/featured-strip";
import { IdentityBand } from "@/components/customer/identity-band";
import { BambooAmbience } from "@/components/customer/bamboo-ambience";
import { getLocale, getT } from "@/lib/i18n/server";
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
        city: settings.brand.city,
      }),
    },
    description: t("home.metaDescription", {
      tagline: settings.brand.tagline,
      brand: settings.brand.name,
      city: settings.brand.city,
    }),
    path: "/",
    keywords: [
      "Panda Wok",
      `Asian food ${settings.brand.city}`,
      `ramen delivery ${settings.brand.city}`,
      "cloud kitchen Egypt",
      "sushi Alexandria",
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
    description: `${brand} serves Asian-inspired wok, ramen and sushi cooked to order in ${settings.brand.city}.`,
    url: "/menu",
    items: menuItems,
  });

  return (
    <>
      <Hero
        brand={brand}
        tagline={restaurant?.tagline_en ?? settings.brand.tagline}
        cuisine={cuisineIdentity}
        city={settings.brand.city}
        etaMinutes={settings.ordering.etaMinutes}
        acceptingOrders={settings.ordering.acceptingOrders}
        minOrder={settings.ordering.minOrderTotal}
        hasMenu={menu.items.length > 0}
        locale={locale}
        t={t}
      />

      <IdentityBand brand={brand} city={settings.brand.city} locale={locale} t={t} />

      {featured.length > 0 ? (
        <section aria-labelledby="featured-heading" className="mx-auto max-w-6xl px-4 py-10">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="featured-heading" className="text-xl font-semibold text-ink-900">
                  {t("home.featuredHeading")}
                </h2>
                <p className="mt-1 text-sm text-ink-700/80">
                  {t("home.featuredSubheading")}
                </p>
              </div>
              <Link
                href="/menu"
                className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-plum-600 hover:text-plum-700 sm:inline-flex"
              >
                {t("home.fullMenu")} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
            <FeaturedDishStrip items={featured} currency={currency} locale={locale} />
          </Reveal>
        </section>
      ) : null}
      <section aria-labelledby="categories-heading" className="mx-auto max-w-6xl px-4 py-6">
        <Reveal>
          <h2 id="categories-heading" className="text-xl font-semibold text-ink-900">
            {t("home.browseBySection")}
          </h2>
          {categories.length === 0 ? (
            <EmptyState
              className="mt-4"
              title={t("home.sectionEmptyTitle")}
              description={t("home.sectionEmptyBody")}
            />
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {categories.map((category, index) => {
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
          )}
        </Reveal>
      </section>

      {menu.items.length > 0 ? (
        <section aria-labelledby="popular-heading" className="mx-auto max-w-6xl px-4 py-10">
          <h2 id="popular-heading" className="text-xl font-semibold text-ink-900">
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
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-plum-600 px-6 font-medium text-rice-50 shadow-washi transition-colors hover:bg-plum-700 sm:w-auto"
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
                className="text-sm font-medium text-plum-600 hover:text-plum-700"
              >
                {t("common.contactKitchen")}
              </Link>
            }
          />
        </section>
      )}

      <JsonLdScript data={structured} />
    </>
  );
}

function Hero({
  brand,
  tagline,
  cuisine,
  city,
  etaMinutes,
  acceptingOrders,
  minOrder,
  hasMenu,
  locale,
  t,
}: {
  brand: string;
  tagline: string;
  cuisine: string | null;
  city: string;
  etaMinutes: number;
  acceptingOrders: boolean;
  minOrder: number;
  hasMenu: boolean;
  locale: string;
  t: T;
}) {
  return (
    <section className="relative overflow-hidden border-b border-ink-900/8">
      <div
        aria-hidden="true"
        data-motion="decorative"
        className="seigaiha pointer-events-none absolute inset-0 opacity-45"
      />
      <BambooAmbience locale={locale} leaves={7} />
      <div
        aria-hidden="true"
        data-motion="decorative"
        className="pointer-events-none absolute -end-16 -top-20 size-64 rounded-full bg-miso-300/25 blur-2xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="plum">{t("home.cloudKitchen")}</Badge>
          <Badge tone="info">{city}</Badge>
          <Badge tone={acceptingOrders ? "success" : "warning"}>
            {acceptingOrders ? t("home.acceptingOrders") : t("home.closedForOrders")}
          </Badge>
        </div>

        <h1 className="mt-4 max-w-2xl text-3xl leading-tight font-semibold text-ink-900 sm:text-5xl">
          {brand}
        </h1>
        <p className="mt-3 max-w-xl text-base text-ink-700/90 sm:text-lg">{tagline}</p>
        {cuisine ? (
          <p
            className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-sm font-medium text-plum-700"
            aria-label={cuisine}
          >
            <span lang="ja" aria-hidden="true">
              日本
            </span>
            <span aria-hidden="true" className="text-ink-700/40">
              ·
            </span>
            <span lang="zh-Hans" aria-hidden="true">
              中华
            </span>
            <span aria-hidden="true" className="text-ink-700/40">
              ·
            </span>
            <span>{cuisine}</span>
          </p>
        ) : null}

        <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-ink-700/85">
          <div className="flex items-center gap-1.5">
            <Clock className="size-4 text-bamboo-600" aria-hidden="true" />
            <dt className="sr-only">{t("home.srDeliveryTime")}</dt>
            <dd>{t("home.deliveryTime", { minutes: etaMinutes })}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-miso-600" aria-hidden="true" />
            <dt className="sr-only">{t("home.srMinimumOrder")}</dt>
            <dd>{t("home.minimumOrderValue", { price: formatPrice(minOrder) })}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Leaf className="size-4 text-jade-600" aria-hidden="true" />
            <dt className="sr-only">{t("home.srDietaryLabels")}</dt>
            <dd>{t("home.dietaryLabels")}</dd>
          </div>
        </dl>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/menu"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-plum-600 px-6 font-medium text-rice-50 shadow-washi transition-colors hover:bg-plum-700"
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
    </section>
  );
}
