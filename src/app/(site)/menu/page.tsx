import Link from "next/link";
import type { Metadata } from "next";
import {
  getMenuRatings,
  getPublicCategories,
  getPublicMenu,
  getRestaurant,
} from "@/lib/services/catalog";
import { buildMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, menuSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { DishCard } from "@/components/customer/dish-card";
import { LeafField2D } from "@/components/customer/leaf-field-2d";
import { MenuFilters } from "@/components/customer/menu-filters";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { getLocale, getT } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { localiseCategory } from "@/lib/i18n/catalog";
import { DEFAULT_CURRENCY } from "@/lib/utils/format";

export const dynamic = "force-dynamic";


export async function generateMetadata(): Promise<Metadata> {
  const [restaurant, locale] = await Promise.all([getRestaurant(), getLocale()]);
  const t = await getT(locale);
  const brand = restaurant?.name_en ?? "Panda Wok";
  return buildMetadata({
    title: t("menu.metaTitle", { brand }),
    description: t("menu.metaDescription", {
      brand,
      currency: DEFAULT_CURRENCY,
      city: restaurant?.city ?? "Alexandria",
    }),
    path: "/menu",
    keywords:
      locale === "ar"
        ? ["قائمة باندا ووك", "مطبخ سحابي الإسكندرية", "توصيل طعام الإسكندرية"]
        : [
            "Panda Wok menu",
            "cloud kitchen Alexandria",
            "food delivery Alexandria",
          ],
    siteName: brand,
    locale,
  });
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; diet?: string }>;
}) {
  const params = await searchParams;
  const [categories, menu, restaurant, locale, ratings] = await Promise.all([
    getPublicCategories(),
    getPublicMenu(),
    getRestaurant(),
    getLocale(),
    getMenuRatings(),
  ]);
  const t = await getT(locale);

  const brand = restaurant?.name_en ?? "Panda Wok";
  const currency = restaurant?.currency ?? "EGP";
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const localisedCategories = categories.map((c) => localiseCategory(c, locale));
  const categoryName = (categoryId: string) =>
    categoryById.get(categoryId)
      ? localiseCategory(categoryById.get(categoryId)!, locale).name
      : t("menu.categoryFallback");

  const query = params.q?.trim().toLowerCase() ?? "";
  const diet = params.diet ?? "";

  // The search haystack intentionally includes both languages, so a customer
  // can find a dish by either its Arabic or English name.
  const filtered = menu.items.filter((item) => {
    if (query) {
      const haystack =
        `${item.name_en} ${item.name_ar ?? ""} ${item.name_ja ?? ""} ${item.description_en ?? ""} ${item.description_ar ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (diet === "spicy" && !item.is_spicy) return false;
    if (diet === "vegetarian" && !(item.is_vegetarian || item.is_vegan)) return false;
    if (diet === "vegan" && !item.is_vegan) return false;
    if (diet === "available" && !item.is_available) return false;
    return true;
  });

  const availableCount = menu.items.filter((i) => i.is_available).length;

  const structured = [
    breadcrumbSchema([
      { name: t("common.home"), path: "/" },
      { name: t("menu.title"), path: "/menu" },
    ]),
    ...(query || diet
      ? []
      : [
          menuSchema({
            name: `${brand} menu`,
            description: `${brand} — ${restaurant?.city ?? "Alexandria"}`,
            url: "/menu",
            items: menu.items.map((item) => ({
              slug: item.slug,
              name: item.name_en,
              description: item.description_en,
              price: Number(item.price),
              currency,
              image: item.image_url,
              category: categoryById.get(item.category_id)?.name_en ?? t("menu.categoryFallback"),
              available: item.is_available,
              vegetarian: item.is_vegetarian,
              vegan: item.is_vegan,
            })),
          }),
        ]),
  ];

  const isFiltered = Boolean(query || diet);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.home"), path: "/" },
          { name: t("menu.title"), path: "/menu" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
          {t("menu.title")}
        </h1>
        <p className="mt-1.5 text-sm text-ink-700/85">
          {t("menu.summary", {
            total: menu.items.length,
            available: availableCount,
          })}
        </p>
      </header>

      {/* Section links, kept as real links so crawlers can follow them. */}
      {categories.length > 0 ? (
        <nav aria-label={t("menu.sections")} className="no-scrollbar -mx-4 mt-5 overflow-x-auto px-4">
          <ul className="flex gap-2">
            {localisedCategories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/menu/${category.slug}`}
                  className="inline-flex whitespace-nowrap rounded-full border border-ink-900/12 bg-rice-50 px-3.5 py-2 text-sm text-ink-800 transition-colors hover:bg-rice-200"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <MenuFilters initialQuery={params.q ?? ""} initialDiet={diet} />

      {menu.items.length === 0 ? (
        <Reveal className="relative mt-6" delay={60}>
          <LeafField2D count={10} />
          <EmptyState
          className="relative"
          title={t("menu.emptyTitle")}
          description={t("menu.emptyBody")}
        />
        </Reveal>
      ) : filtered.length === 0 ? (
        <Reveal className="mt-6" delay={60}>
        <EmptyState
          title={isFiltered ? t("menu.noMatchTitle") : t("menu.nothingTitle")}
          description={isFiltered ? t("menu.noMatchBody") : t("menu.nothingBody")}
          action={
            isFiltered ? (
              <Link
                href="/menu"
                className="text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
              >
                {t("menu.clearFilters")}
              </Link>
            ) : null
          }
        />
        </Reveal>
      ) : isFiltered ? (
        <section className="mt-6" aria-live="polite">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700/70">
            {filtered.length === 1
              ? t("menu.resultCount", { count: filtered.length })
              : t("menu.resultsCount", { count: filtered.length })}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item, index) => (
              <li key={item.id}>
                <DishCard
                  item={item}
                  currency={currency}
                  locale={locale}
                  categoryName={categoryName(item.category_id)}
                  priority={index < 3}
                  rating={ratings.get(item.id) ?? null}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-8 space-y-10">
          {localisedCategories.map((category, index) => {
            const items = menu.items.filter((i) => i.category_id === category.id);
            if (items.length === 0) return null;

            return (
              <Reveal as="section" key={category.id} aria-labelledby={`cat-${category.slug}`} delay={(index % 3) * 70}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2
                      id={`cat-${category.slug}`}
                      className="font-display text-fluid-h3 font-semibold text-ink-900"
                    >
                      {category.name}
                      {category.name_ja ? (
                        <span
                          lang="ja"
                          className="font-kana ms-2 align-middle text-sm font-normal text-ink-700/60"
                        >
                          {category.name_ja}
                        </span>
                      ) : null}
                    </h2>
                    {category.description ? (
                      <p className="mt-1 text-sm text-ink-700/80">
                        {category.description}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={`/menu/${category.slug}`}
                    className="shrink-0 text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
                  >
                    {t("menu.sectionPage")}
                  </Link>
                </div>

                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <li key={item.id}>
                      <DishCard
                        item={item}
                        currency={currency}
                        locale={locale}
                        categoryName={category.name}
                        rating={ratings.get(item.id) ?? null}
                      />
                    </li>
                  ))}
                </ul>
              </Reveal>
            );
          })}
        </div>
      )}

      <JsonLdScript data={structured} />
    </div>
  );
}

/** Kept for typing clarity when the locale is needed elsewhere in this file. */
export type { Locale };
