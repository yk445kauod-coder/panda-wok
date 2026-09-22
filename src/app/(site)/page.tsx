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

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  return buildMetadata({
    title: `${settings.brand.name} — wok, ramen and sushi delivered in ${settings.brand.city}`,
    description: `${settings.brand.tagline}. Browse the full Panda Wok menu, order for delivery across ${settings.brand.city} and track your food from the kitchen to your door.`,
    path: "/",
    keywords: [
      "Panda Wok",
      `Asian food ${settings.brand.city}`,
      `ramen delivery ${settings.brand.city}`,
      "cloud kitchen Egypt",
      "sushi Alexandria",
    ],
    siteName: settings.brand.name,
  });
}

export default async function HomePage() {
  const [featured, categories, menu, settings, restaurant] = await Promise.all([
    getFeaturedItems(6),
    getPublicCategories(),
    getPublicMenu(),
    getPublicSettings(),
    getRestaurant(),
  ]);

  const brand = restaurant?.name_en ?? settings.brand.name;
  const currency = restaurant?.currency ?? "EGP";

  const menuItems = menu.items.slice(0, 40).map((item) => ({
    slug: item.slug,
    name: item.name_en,
    description: item.description_en,
    price: Number(item.price),
    currency,
    image: item.image_url,
    category: categories.find((c) => c.id === item.category_id)?.name_en ?? "Menu",
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
      />

      {featured.length > 0 ? (
        <section aria-labelledby="featured-heading" className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="featured-heading" className="text-xl font-semibold text-ink-900">
                What the kitchen is proud of
              </h2>
              <p className="mt-1 text-sm text-ink-700/80">
                Hand-picked dishes, cooked when you order.
              </p>
            </div>
            <Link
              href="/menu"
              className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-plum-600 hover:text-plum-700 sm:inline-flex"
            >
              Full menu <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <FeaturedDishStrip items={featured} currency={currency} />
        </section>
      ) : null}

      <section aria-labelledby="categories-heading" className="mx-auto max-w-6xl px-4 py-6">
        <h2 id="categories-heading" className="text-xl font-semibold text-ink-900">
          Browse by section
        </h2>
        {categories.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="The menu is being prepared"
            description="Our sections will appear here as soon as the kitchen publishes them."
          />
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((category) => {
              const count = menu.items.filter((i) => i.category_id === category.id).length;
              return (
                <li key={category.id}>
                  <Link
                    href={`/menu/${category.slug}`}
                    className="washi-panel group flex h-full flex-col justify-between p-4 transition-shadow hover:shadow-washi-lg"
                  >
                    <span className="font-display text-base font-semibold text-ink-900">
                      {category.name_en}
                    </span>
                    {category.name_ja ? (
                      <span className="mt-0.5 text-xs text-ink-700/60" lang="ja">
                        {category.name_ja}
                      </span>
                    ) : null}
                    <span className="mt-3 text-xs text-ink-700/70">
                      {count} {count === 1 ? "dish" : "dishes"}
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
            Available right now
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
                    categoryName={
                      categories.find((c) => c.id === item.category_id)?.name_en ?? "Menu"
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
              See the whole menu <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <EmptyState
            title="No dishes published yet"
            description="Once the kitchen adds dishes they will appear here, with prices and allergen information."
            action={
              <Link
                href="/contact"
                className="text-sm font-medium text-plum-600 hover:text-plum-700"
              >
                Contact the kitchen
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
}: {
  brand: string;
  tagline: string;
  city: string;
  etaMinutes: number;
  acceptingOrders: boolean;
  minOrder: number;
  hasMenu: boolean;
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
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-miso-300/25 blur-2xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="plum">Cloud kitchen</Badge>
          <Badge tone="info">{city}</Badge>
          <Badge tone={acceptingOrders ? "success" : "warning"}>
            {acceptingOrders ? "Accepting orders" : "Closed for new orders"}
          </Badge>
        </div>

        <h1 className="mt-4 max-w-2xl text-3xl leading-tight font-semibold text-ink-900 sm:text-5xl">
          {brand}
        </h1>
        <p className="mt-3 max-w-xl text-base text-ink-700/90 sm:text-lg">{tagline}</p>

        <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-ink-700/85">
          <div className="flex items-center gap-1.5">
            <Clock className="size-4 text-bamboo-600" aria-hidden="true" />
            <dt className="sr-only">Typical delivery time</dt>
            <dd>About {etaMinutes} minutes, plus prep</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-miso-600" aria-hidden="true" />
            <dt className="sr-only">Minimum order</dt>
            <dd>Minimum {formatPrice(minOrder)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Leaf className="size-4 text-jade-600" aria-hidden="true" />
            <dt className="sr-only">Dietary labels</dt>
            <dd>Vegetarian and spicy dishes labelled</dd>
          </div>
        </dl>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/menu"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-plum-600 px-6 font-medium text-rice-50 shadow-washi transition-colors hover:bg-plum-700"
          >
            {hasMenu ? "Start your order" : "View the menu"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/about"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-900/15 bg-rice-50/70 px-6 font-medium text-ink-900 transition-colors hover:bg-rice-100"
          >
            Our story
          </Link>
        </div>
      </div>
    </section>
  );
}
