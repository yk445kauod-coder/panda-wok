import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { DishCard } from "@/components/customer/dish-card";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import type { Category, MenuItem } from "@/lib/services/catalog";
import type { Locale } from "@/lib/i18n/config";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { en } from "@/lib/i18n/dictionaries/en";
import { makeTranslator } from "@/lib/i18n/translate";
import { localiseCategory } from "@/lib/i18n/catalog";

export function CategorySection({
  category,
  items,
  categories,
  currency,
  locale = "en",
}: {
  category: Category;
  items: MenuItem[];
  categories: Category[];
  currency: string;
  locale?: Locale;
}) {
  const t = makeTranslator(locale === "ar" ? ar : en);
  const available = items.filter((i) => i.is_available).length;
  const local = localiseCategory(category, locale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.home"), path: "/" },
          { name: t("menu.title"), path: "/menu" },
          { name: local.name, path: `/menu/${category.slug}` },
        ]}
      />

      <Reveal as="header" className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
          {local.name}
        </h1>
        {category.name_ja ? (
          <p className="mt-1 text-sm text-ink-700/60" lang="ja">
            {category.name_ja}
          </p>
        ) : null}
        {local.description ? (
          <p className="mt-2 max-w-2xl text-sm text-ink-700/85">
            {local.description}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-ink-700/70">
          {t("menu.summary", { total: items.length, available })}
        </p>
      </Reveal>

      {categories.length > 1 ? (
        <nav
          aria-label={t("menu.sections")}
          className="no-scrollbar -mx-4 mt-5 overflow-x-auto px-4"
        >
          <ul className="flex gap-2">
            {categories.map((other) => {
              const active = other.id === category.id;
              const otherLocal = localiseCategory(other, locale);
              return (
                <li key={other.id}>
                  <Link
                    href={`/menu/${other.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "inline-flex whitespace-nowrap rounded-full border border-indigo-600 bg-indigo-600 px-3.5 py-2 text-sm text-rice-50"
                        : "inline-flex whitespace-nowrap rounded-full border border-ink-900/12 bg-rice-50 px-3.5 py-2 text-sm text-ink-800 transition-colors hover:bg-rice-200"
                    }
                  >
                    {otherLocal.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {items.length === 0 ? (
        <Reveal className="mt-6" delay={60}>
        <EmptyState
          title={t("menu.emptyTitle")}
          description={t("menu.emptyBody")}
          action={
            <Link
              href="/menu"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              {t("home.fullMenu")}
            </Link>
          }
        />
        </Reveal>
      ) : (
        <Reveal className="mt-6" delay={60}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.id}>
              <DishCard
                item={item}
                currency={currency}
                locale={locale}
                categoryName={local.name}
                priority={index < 3}
              />
            </li>
          ))}
        </ul>
        </Reveal>
      )}
    </div>
  );
}
