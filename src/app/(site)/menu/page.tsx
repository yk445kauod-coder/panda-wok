import Link from "next/link";
import type { Metadata } from "next";
import { getPublicCategories, getPublicMenu, getRestaurant } from "@/lib/services/catalog";
import { buildMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, menuSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { EmptyState } from "@/components/ui/empty-state";
import { DishCard } from "@/components/customer/dish-card";
import { MenuFilters } from "@/components/customer/menu-filters";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const restaurant = await getRestaurant();
  const brand = restaurant?.name_en ?? "Panda Wok";
  return buildMetadata({
    title: `Menu — Asian wok, ramen and sushi`,
    description: `The full ${brand} menu with prices in EGP: wok dishes, ramen, sushi and izakaya plates, cooked to order and delivered across Alexandria.`,
    path: "/menu",
    keywords: [
      "Panda Wok menu",
      "Alexandria Asian menu",
      "ramen price Egypt",
      "sushi delivery Alexandria",
    ],
    siteName: brand,
  });
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; diet?: string }>;
}) {
  const params = await searchParams;
  const [categories, menu, restaurant] = await Promise.all([
    getPublicCategories(),
    getPublicMenu(),
    getRestaurant(),
  ]);

  const brand = restaurant?.name_en ?? "Panda Wok";
  const currency = restaurant?.currency ?? "EGP";
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const query = params.q?.trim().toLowerCase() ?? "";
  const diet = params.diet ?? "";

  const filtered = menu.items.filter((item) => {
    if (query) {
      const haystack = `${item.name_en} ${item.name_ar ?? ""} ${item.name_ja ?? ""} ${item.description_en ?? ""}`.toLowerCase();
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
      { name: "Home", path: "/" },
      { name: "Menu", path: "/menu" },
    ]),
    ...(query || diet
      ? []
      : [
          menuSchema({
            name: `${brand} menu`,
            description: `Wok, ramen, sushi and izakaya plates from ${brand} in Alexandria.`,
            url: "/menu",
            items: menu.items.map((item) => ({
              slug: item.slug,
              name: item.name_en,
              description: item.description_en,
              price: Number(item.price),
              currency,
              image: item.image_url,
              category: categoryById.get(item.category_id)?.name_en ?? "Menu",
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
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Menu", path: "/menu" }]} />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">Menu</h1>
        <p className="mt-1.5 text-sm text-ink-700/85">
          {menu.items.length} dishes, {availableCount} available right now. Everything is
          cooked to order.
        </p>
      </header>

      {/* Section links, kept as real links so crawlers can follow them. */}
      {categories.length > 0 ? (
        <nav aria-label="Menu sections" className="no-scrollbar -mx-4 mt-5 overflow-x-auto px-4">
          <ul className="flex gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/menu/${category.slug}`}
                  className="inline-flex whitespace-nowrap rounded-full border border-ink-900/12 bg-rice-50 px-3.5 py-2 text-sm text-ink-800 transition-colors hover:bg-rice-200"
                >
                  {category.name_en}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <MenuFilters initialQuery={params.q ?? ""} initialDiet={diet} />

      {menu.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="The menu is empty"
          description="The kitchen has not published any dishes yet. Please check back shortly or contact us directly."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={isFiltered ? "No dishes match that" : "Nothing to show"}
          description={
            isFiltered
              ? "Try a different search term or clear the dietary filter."
              : "The kitchen has not published any dishes yet."
          }
          action={
            isFiltered ? (
              <Link
                href="/menu"
                className="text-sm font-medium text-plum-600 hover:text-plum-700"
              >
                Clear filters
              </Link>
            ) : null
          }
        />
      ) : isFiltered ? (
        <section className="mt-6" aria-live="polite">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700/70">
            {filtered.length} {filtered.length === 1 ? "result" : "results"}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item, index) => (
              <li key={item.id}>
                <DishCard
                  item={item}
                  currency={currency}
                  categoryName={categoryById.get(item.category_id)?.name_en}
                  priority={index < 3}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-8 space-y-10">
          {categories.map((category) => {
            const items = menu.items.filter((i) => i.category_id === category.id);
            if (items.length === 0) return null;

            return (
              <section key={category.id} aria-labelledby={`cat-${category.slug}`}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2
                      id={`cat-${category.slug}`}
                      className="text-xl font-semibold text-ink-900"
                    >
                      {category.name_en}
                    </h2>
                    {category.description_en ? (
                      <p className="mt-1 text-sm text-ink-700/80">
                        {category.description_en}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={`/menu/${category.slug}`}
                    className="shrink-0 text-sm font-medium text-plum-600 hover:text-plum-700"
                  >
                    Section page
                  </Link>
                </div>

                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <li key={item.id}>
                      <DishCard
                        item={item}
                        currency={currency}
                        categoryName={category.name_en}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <JsonLdScript data={structured} />
    </div>
  );
}
