"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useLocalePath } from "@/components/i18n-hooks";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { DishCard } from "@/components/customer/dish-card";
import { LeafField2D } from "@/components/customer/leaf-field-2d";
import { MenuFilters } from "@/components/customer/menu-filters";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { PageLoading, PageError } from "@/components/ui/page-states";
import { useStore } from "@/components/customer/store-data";
import { localiseCategory } from "@/lib/i18n/catalog";

/**
 * The menu, rendered from the client store.
 *
 * This page used to be a server component that awaited the whole catalogue, so
 * every visit made the Worker render 90 dishes — the heaviest document on the
 * site and the easiest way to blow the Free plan's 10 ms CPU budget. It is a
 * static shell now: the catalogue arrives from `/api/public/bootstrap`, and the
 * filtering, grouping and search all happen in the browser.
 */
export function MenuPage() {
  const { t } = useI18n();
  const lp = useLocalePath();
  const searchParams = useSearchParams();
  const { data, loading, error } = useStore();

  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";

  const view = useMemo(() => {
    if (!data) return null;
    const { menu, categories, ratings, restaurant } = data;
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const localisedCategories = categories.map((c) => localiseCategory(c, data.locale));
    const categoryName = (categoryId: string) => {
      const category = categoryById.get(categoryId);
      return category
        ? localiseCategory(category, data.locale).name
        : t("menu.categoryFallback");
    };

    // The haystack includes both languages, so a dish is found by either its
    // Arabic or English name.
    const filtered = menu.items.filter((item) => {
      if (!query) return true;
      const haystack =
        `${item.name_en} ${item.name_ar ?? ""} ${item.description_en ?? ""} ${item.description_ar ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });

    const availableCount = menu.items.filter((i) => i.is_available).length;

    const groups = localisedCategories
      .map((category) => ({
        category,
        items: menu.items.filter((i) => i.category_id === category.id),
      }))
      .filter((group) => group.items.length > 0);

    return {
      categories: localisedCategories,
      categoryName,
      filtered,
      availableCount,
      groups,
      ratings,
      currency: restaurant?.currency ?? "EGP",
      total: menu.items.length,
    };
  }, [data, query, t]);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <PageError message={error} />;
  if (!view) return null;

  const isFiltered = Boolean(query);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.home"), path: "/" },
          { name: t("menu.title"), path: "/menu" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">{t("menu.title")}</h1>
        <p className="mt-1.5 text-sm text-ink-700/85">
          {t("menu.summary", { total: view.total, available: view.availableCount })}
        </p>
      </header>

      {view.categories.length > 0 ? (
        <nav aria-label={t("menu.sections")} className="no-scrollbar -mx-4 mt-5 overflow-x-auto px-4">
          <ul className="flex gap-2">
            {view.categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={lp(`/menu/${category.slug}`)}
                  className="inline-flex whitespace-nowrap rounded-full border border-ink-900/12 bg-rice-50 px-3.5 py-2 text-sm text-ink-800 transition-colors hover:bg-rice-200"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <MenuFilters initialQuery={query} />

      {view.total === 0 ? (
        <Reveal className="relative mt-6" delay={60}>
          <LeafField2D count={10} />
          <EmptyState className="relative" title={t("menu.emptyTitle")} description={t("menu.emptyBody")} />
        </Reveal>
      ) : view.filtered.length === 0 ? (
        <Reveal className="mt-6" delay={60}>
          <EmptyState
            title={t("menu.noMatchTitle")}
            description={t("menu.noMatchBody")}
            action={
              <Link
                href={lp("/menu")}
                className="text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
              >
                {t("menu.clearFilters")}
              </Link>
            }
          />
        </Reveal>
      ) : isFiltered ? (
        <section className="mt-6" aria-live="polite">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700/70">
            {view.filtered.length === 1
              ? t("menu.resultCount", { count: view.filtered.length })
              : t("menu.resultsCount", { count: view.filtered.length })}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {view.filtered.map((item, index) => (
              <li key={item.id}>
                <DishCard
                  item={item}
                  currency={view.currency}
                  locale={data!.locale}
                  categoryName={view.categoryName(item.category_id)}
                  priority={index < 3}
                  rating={view.ratings[item.id] ?? null}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-8 space-y-10">
          {view.groups.map((group, index) => (
            <Reveal as="section" key={group.category.id} aria-labelledby={`cat-${group.category.slug}`} delay={(index % 3) * 70}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id={`cat-${group.category.slug}`} className="font-display text-fluid-h3 font-semibold text-ink-900">
                    {group.category.name}
                  </h2>
                  {group.category.description ? (
                    <p className="mt-1 text-sm text-ink-700/80">{group.category.description}</p>
                  ) : null}
                </div>
                <Link
                  href={lp(`/menu/${group.category.slug}`)}
                  className="shrink-0 text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
                >
                  {t("menu.sectionPage")}
                </Link>
              </div>

              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <DishCard
                      item={item}
                      currency={view.currency}
                      locale={data!.locale}
                      categoryName={group.category.name}
                      rating={view.ratings[item.id] ?? null}
                    />
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
