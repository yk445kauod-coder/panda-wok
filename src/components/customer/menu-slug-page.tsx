"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { useLocalePath } from "@/components/i18n-hooks";
import { usePublicData } from "@/lib/public/client";
import { useStore } from "@/components/customer/store-data";
import { PageLoading, PageError } from "@/components/ui/page-states";
import { EmptyState } from "@/components/ui/empty-state";
import { CategorySection } from "@/components/customer/category-section";
import { DishDetail } from "@/components/customer/dish-detail";
import { localisedName } from "@/lib/i18n/catalog";
import type { Category, MenuItem, MenuItemDetail } from "@/lib/services/catalog";

type SlugData =
  | { kind: "category"; category: Category; items: MenuItem[] }
  | { kind: "dish"; dish: MenuItemDetail; related: MenuItem[] }
  | { kind: "missing" };

/**
 * `/menu/<slug>` — a section or a dish, resolved on the client.
 *
 * One URL segment serves both shapes, so the shell cannot decide which view to
 * render without reading the database. The browser asks `/api/public/menu/<slug>`
 * and picks the same branch the server page used: category first, then dish,
 * then a not-found panel. The dish view needs modifier groups, which is why
 * this has its own endpoint rather than riding the catalogue bootstrap.
 */
export function MenuSlugPage() {
  const { t } = useI18n();
  const lp = useLocalePath();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { data: store, loading: storeLoading } = useStore();
  const { data, loading, error } = usePublicData<SlugData>(
    `/api/public/menu/${encodeURIComponent(slug)}`,
  );

  if ((loading || storeLoading) && !data) return <PageLoading />;
  if (error && !data) return <PageError message={error} />;
  if (!data || !store) return null;

  if (data.kind === "missing") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("errors.notFoundTitle")}
          description={t("errors.notFoundBody")}
          action={
            <Link
              href={lp("/menu")}
              className="text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
            >
              {t("home.fullMenu")}
            </Link>
          }
        />
      </div>
    );
  }

  const currency = store.restaurant?.currency ?? "EGP";

  if (data.kind === "category") {
    return (
      <CategorySection
        category={data.category}
        items={data.items}
        categories={store.categories}
        currency={currency}
        locale={store.locale}
      />
    );
  }

  const dish = data.dish;
  const categoryName = dish.categories
    ? localisedName(dish.categories, store.locale)
    : t("menu.categoryFallback");

  return (
    <DishDetail
      dish={dish}
      related={data.related}
      currency={currency}
      categoryName={categoryName}
      locale={store.locale}
    />
  );
}
