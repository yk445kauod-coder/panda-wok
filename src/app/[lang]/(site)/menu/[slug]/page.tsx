import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getCategoryBySlug,
  getMenuItemsByCategory,
  getMenuItemBySlug,
  getPublicCategories,
  getPublicMenu,
  getRestaurant,
} from "@/lib/services/catalog";
import { buildMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, productSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { CategorySection } from "@/components/customer/category-section";
import { DishDetail } from "@/components/customer/dish-detail";
import { localePath } from "@/lib/i18n/config";
import { staticLocale, staticT } from "@/lib/i18n/static";
import {
  localiseCategory,
  localisedName,
  localisedDescription,
} from "@/lib/i18n/catalog";

/**
 * A single segment serves both nested shapes the spec calls for:
 *   /menu/sushi          -> the sushi section
 *   /menu/chicken-ramen  -> one dish
 * The category is resolved first, then the dish, and anything else 404s. This
 * keeps public URLs free of ids and avoids a colliding route tree.
 */
type PageProps = { params: Promise<{ lang: string; slug: string }> };

/**
 * Rendered on demand and refreshed on a window, not frozen at build time.
 *
 * The menu changes from the admin console, and a prerendered page is a read-only
 * asset the incremental cache never rewrites — so a new dish or a new photo would
 * not appear until the next deploy. An ISR window plus the admin action's
 * `revalidatePublicPath` call makes an edit visible on the next request.
 */
export const revalidate = 300;


export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang, slug } = await params;
  const locale = staticLocale(lang);
  const t = staticT(locale);
  const restaurant = await getRestaurant();
  const brand = restaurant?.name_en ?? "Panda Wok";

  const category = await getCategoryBySlug(slug);
  if (category) {
    const local = localiseCategory(category, locale);
    const seoTitle =
      locale === "ar" ? category.seo_title ?? null : category.seo_title;
    return buildMetadata({
      title: seoTitle ?? `${local.name} — ${brand}`,
      description:
        category.seo_description ??
        local.description ??
        `${brand} — ${local.name}`,
      path: localePath(locale, `/menu/${category.slug}`),
      image: category.image_url,
      imageAlt: local.name,
      siteName: brand,
      locale,
    });
  }

  const dish = await getMenuItemBySlug(slug);
  if (dish) {
    const dishName = localisedName(dish, locale);
    const description =
      dish.seo_description ??
      localisedDescription(dish, locale) ??
      `${dishName} — ${Number(dish.price).toFixed(2)} EGP.`;

    return buildMetadata({
      title:
        dish.seo_title ?? `${dishName} — ${Number(dish.price).toFixed(2)} EGP`,
      description,
      path: localePath(locale, `/menu/${dish.slug}`),
      image: dish.image_url,
      imageAlt: dish.image_alt ?? dishName,
      keywords: dish.seo_keywords ?? undefined,
      type: "article",
      siteName: brand,
      locale,
    });
  }

  // Unknown slugs must never look like real pages: emit dedicated
  // noindex metadata so crawlers drop whatever stale link led here. Next
  // streams this route segment, so the body-level notFound() provides the
  // correct UI while this metadata guarantees the noindex directive.

  return buildMetadata({
    title: t("errors.notFoundTitle"),
    description: t("errors.notFoundBody"),
    path: localePath(locale, `/menu/${slug}`),
    noIndex: true,
  });
}

export default async function MenuSlugPage({ params }: PageProps) {
  const { lang, slug } = await params;
  const locale = staticLocale(lang);
  const t = staticT(locale);
  const [restaurant, categories] = await Promise.all([
    getRestaurant(),
    getPublicCategories(),
  ]);
  const currency = restaurant?.currency ?? "EGP";

  const category = await getCategoryBySlug(slug);

  if (category) {
    const items = await getMenuItemsByCategory(category.id);
    const local = localiseCategory(category, locale);
    return (
      <>
        <CategorySection
          category={category}
          items={items}
          categories={categories}
          currency={currency}
          locale={locale}
        />
        <JsonLdScript
          data={breadcrumbSchema([
            { name: t("common.home"), path: localePath(locale, "/") },
            { name: t("menu.title"), path: localePath(locale, "/menu") },
            { name: local.name, path: localePath(locale, `/menu/${category.slug}`) },
          ])}
        />
      </>
    );
  }

  const dish = await getMenuItemBySlug(slug);
  if (!dish) notFound();

  // Related dishes from the same section, excluding the dish itself.
  const menu = await getPublicMenu();
  const related = menu.items
    .filter((i) => i.category_id === dish.category_id && i.id !== dish.id)
    .slice(0, 4);

  const categoryName = dish.categories
    ? localisedName(dish.categories, locale)
    : t("menu.categoryFallback");
  const dishName = localisedName(dish, locale);
  const breadcrumbs = [
    { name: t("common.home"), path: localePath(locale, "/") },
    { name: t("menu.title"), path: localePath(locale, "/menu") },
    ...(dish.categories
      ? [{ name: categoryName, path: localePath(locale, `/menu/${dish.categories.slug}`) }]
      : []),
    { name: dishName, path: localePath(locale, `/menu/${dish.slug}`) },
  ];

  return (
    <>
      <DishDetail
        dish={dish}
        related={related}
        currency={currency}
        categoryName={categoryName}
        locale={locale}
      />
      <JsonLdScript
        data={[
          breadcrumbSchema(breadcrumbs),
          productSchema({
            slug: dish.slug,
            name: dish.name_en,
            description: dish.description_en,
            price: Number(dish.price),
            currency,
            image: dish.image_url,
            available: dish.is_available,
            category: categoryName,
          }),
        ]}
      />
    </>
  );
}
