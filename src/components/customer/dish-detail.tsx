import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Flame,
  Leaf,
  Nut,
  ShieldAlert,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { DishCard } from "@/components/customer/dish-card";
import { AddToCartPanel } from "@/components/customer/add-to-cart-panel";
import { UpsellSuggestions } from "@/components/customer/upsell-suggestions";
import { ItemViewTracker } from "@/components/customer/item-view-tracker";
import { formatPrice, humanise } from "@/lib/utils/format";
import type { MenuItem, MenuItemDetail } from "@/lib/services/catalog";

export function DishDetail({
  dish,
  related,
  currency,
  categoryName,
}: {
  dish: MenuItemDetail;
  related: MenuItem[];
  currency: string;
  categoryName: string;
}) {
  const unavailable = !dish.is_available;

  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Menu", path: "/menu" },
    ...(dish.categories
      ? [{ name: categoryName, path: `/menu/${dish.categories.slug}` }]
      : []),
    { name: dish.name_en, path: `/menu/${dish.slug}` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ItemViewTracker
        menuItemId={dish.id}
        slug={dish.slug}
        name={dish.name_en}
      />

      <Breadcrumbs items={breadcrumbs} />

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-washi bg-rice-200 shadow-washi">
            {dish.image_url ? (
              <Image
                src={dish.image_url}
                alt={dish.image_alt ?? dish.name_en}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
                className="object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="seigaiha grid h-full place-items-center text-sm text-ink-700/50"
              >
                Photo coming soon
              </div>
            )}
            {dish.has_transparent_png ? (
              <span className="absolute left-3 top-3">
                <Badge tone="info">Cut-out available</Badge>
              </span>
            ) : null}
          </div>

          {dish.menu_images.length > 1 ? (
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {dish.menu_images.map((image, index) => {
                const src = image.external_url ?? image.storage_path;
                if (!src) return null;
                return (
                  <li key={image.id} className="shrink-0">
                    <div className="relative size-20 overflow-hidden rounded-lg border border-ink-900/10">
                      <Image
                        src={src}
                        alt={image.alt_en ?? `${dish.name_en} view ${index + 1}`}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/menu/${dish.categories?.slug ?? ""}`}
              className="text-sm font-medium text-plum-600 hover:text-plum-700"
            >
              {categoryName}
            </Link>
            {dish.is_featured ? <Badge tone="plum">Chef&apos;s pick</Badge> : null}
            {unavailable ? <Badge tone="danger">Sold out</Badge> : null}
          </div>

          <h1 className="mt-2 text-2xl font-semibold text-ink-900 sm:text-3xl">
            {dish.name_en}
          </h1>

          {dish.name_ar ? (
            <p className="mt-1 text-base text-ink-700/80" dir="rtl" lang="ar">
              {dish.name_ar}
            </p>
          ) : null}
          {dish.name_ja ? (
            <p className="mt-0.5 text-sm text-ink-700/60" lang="ja">
              {dish.name_ja}
            </p>
          ) : null}

          <p className="mt-3 text-2xl font-semibold text-ink-900">
            {formatPrice(dish.price)}
            {dish.compare_at_price && Number(dish.compare_at_price) > Number(dish.price) ? (
              <span className="ml-2 text-base font-normal text-ink-700/50 line-through">
                {formatPrice(dish.compare_at_price)}
              </span>
            ) : null}
          </p>

          <ul className="mt-4 flex flex-wrap gap-2 text-xs">
            {dish.prep_minutes ? (
              <li className="inline-flex items-center gap-1.5 rounded-full bg-rice-200/70 px-2.5 py-1 text-ink-800">
                <Clock className="size-3.5" aria-hidden="true" />
                About {dish.prep_minutes} min prep
              </li>
            ) : null}
            {dish.calories ? (
              <li className="inline-flex items-center gap-1.5 rounded-full bg-rice-200/70 px-2.5 py-1 text-ink-800">
                <Utensils className="size-3.5" aria-hidden="true" />
                {dish.calories} kcal
              </li>
            ) : null}
            {dish.is_spicy ? (
              <li className="inline-flex items-center gap-1.5 rounded-full bg-chili-500/12 px-2.5 py-1 text-chili-600">
                <Flame className="size-3.5" aria-hidden="true" />
                Spicy
              </li>
            ) : null}
            {dish.is_vegan ? (
              <li className="inline-flex items-center gap-1.5 rounded-full bg-jade-500/12 px-2.5 py-1 text-jade-600">
                <Leaf className="size-3.5" aria-hidden="true" />
                Vegan
              </li>
            ) : dish.is_vegetarian ? (
              <li className="inline-flex items-center gap-1.5 rounded-full bg-jade-500/12 px-2.5 py-1 text-jade-600">
                <Leaf className="size-3.5" aria-hidden="true" />
                Vegetarian
              </li>
            ) : null}
            {dish.contains_nuts ? (
              <li className="inline-flex items-center gap-1.5 rounded-full bg-miso-500/18 px-2.5 py-1 text-miso-600">
                <Nut className="size-3.5" aria-hidden="true" />
                Contains nuts
              </li>
            ) : null}
          </ul>

          {dish.description_en ? (
            <p className="mt-4 text-sm leading-relaxed text-ink-700/90">
              {dish.description_en}
            </p>
          ) : null}

          {dish.description_ar ? (
            <p
              className="mt-2 text-sm leading-relaxed text-ink-700/80"
              dir="rtl"
              lang="ar"
            >
              {dish.description_ar}
            </p>
          ) : null}

          {dish.ingredients && dish.ingredients.length > 0 ? (
            <section className="mt-5">
              <h2 className="text-sm font-semibold text-ink-900">Ingredients</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {dish.ingredients.map((ingredient) => (
                  <li
                    key={ingredient}
                    className="rounded-full bg-rice-200/70 px-2.5 py-1 text-xs text-ink-800"
                  >
                    {ingredient}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {dish.allergens && dish.allergens.length > 0 ? (
            <section className="mt-5 rounded-xl border border-miso-500/25 bg-miso-300/12 p-3.5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <ShieldAlert className="size-4 text-miso-600" aria-hidden="true" />
                Allergens recorded for this dish
              </h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {dish.allergens.map((allergen) => (
                  <li
                    key={allergen}
                    className="rounded-full bg-rice-50 px-2.5 py-1 text-xs text-ink-800"
                  >
                    {humanise(allergen)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-700/80">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                This list is what the kitchen has recorded and is not a guarantee. If you
                have a serious allergy, please confirm directly with us before ordering.
              </p>
            </section>
          ) : null}

          <AddToCartPanel dish={dish} currency={currency} />

          <UpsellSuggestions
            triggerMenuItemId={dish.id}
            triggerCategoryId={dish.category_id}
            currency={currency}
          />
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-12" aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-lg font-semibold text-ink-900">
            More from {categoryName}
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <li key={item.id}>
                <DishCard item={item} currency={currency} categoryName={categoryName} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
