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
import { formatPrice } from "@/lib/utils/format";
import { DishCard } from "@/components/customer/dish-card";
import { FeaturedDishStrip } from "@/components/customer/featured-strip";
import { getLocale, getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/server";
import { localiseCategory } from "@/lib/i18n/catalog";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([getPublicSettings(), getLocale()]);
  const t = await getT(locale);
  return buildMetadata({
    title: t("home.metaTitle", {
      brand: settings.brand.name,
      city: settings.brand.city,
    }),
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
        city={settings.brand.city}
        etaMinutes={settings.ordering.etaMinutes}
        acceptingOrders={settings.ordering.acceptingOrders}
        minOrder={settings.ordering.minOrderTotal}
        hasMenu={menu.items.length > 0}
        t={t}
      />

      {featured.length > 0 ? (
        <section aria-labelledby="featured-heading" className="mx-auto max-w-6xl px-4 py-10">
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
        </section>
      ) : null}

      <section aria-labelledby="categories-heading" className="mx-auto max-w-6xl px-4 py-6">
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
            {categories.map((category) => {
              const local = localiseCategory(category, locale);
              const count = menu.items.filter((i) => i.category_id === category.id).length;
              return (
                <li key={category.id}>
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
                </li>
              );
            })}
          </ul>
        )}
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
              .map((item) => (
                <li key={item.id}>
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
                </li>
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
  city,
  etaMinutes,
  acceptingOrders,
  minOrder,
  hasMenu,
  t,
}: {
  brand: string;
  tagline: string;
  city: string;
  etaMinutes: number;
  acceptingOrders: boolean;
  minOrder: number;
  hasMenu: boolean;
  t: T;
}) {
  return (
    <section className="relative overflow-hidden border-b border-ink-900/8">
      <div
        aria-hidden="true"
        data-motion="decorative"
        className="seigaiha pointer-events-none absolute inset-0 opacity-45"
      />
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
