import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { DishCard } from "@/components/customer/dish-card";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import type { Category, MenuItem } from "@/lib/services/catalog";

export function CategorySection({
  category,
  items,
  categories,
  currency,
}: {
  category: Category;
  items: MenuItem[];
  categories: Category[];
  currency: string;
}) {
  const available = items.filter((i) => i.is_available).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Menu", path: "/menu" },
          { name: category.name_en, path: `/menu/${category.slug}` },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
          {category.name_en}
        </h1>
        {category.name_ja ? (
          <p className="mt-1 text-sm text-ink-700/60" lang="ja">
            {category.name_ja}
          </p>
        ) : null}
        {category.description_en ? (
          <p className="mt-2 max-w-2xl text-sm text-ink-700/85">
            {category.description_en}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-ink-700/70">
          {items.length} {items.length === 1 ? "dish" : "dishes"} · {available} available
          now
        </p>
      </header>

      {categories.length > 1 ? (
        <nav
          aria-label="Menu sections"
          className="no-scrollbar -mx-4 mt-5 overflow-x-auto px-4"
        >
          <ul className="flex gap-2">
            {categories.map((other) => {
              const active = other.id === category.id;
              return (
                <li key={other.id}>
                  <Link
                    href={`/menu/${other.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "inline-flex whitespace-nowrap rounded-full border border-plum-600 bg-plum-600 px-3.5 py-2 text-sm text-rice-50"
                        : "inline-flex whitespace-nowrap rounded-full border border-ink-900/12 bg-rice-50 px-3.5 py-2 text-sm text-ink-800 transition-colors hover:bg-rice-200"
                    }
                  >
                    {other.name_en}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={`No ${category.name_en.toLowerCase()} published yet`}
          description="This section exists but has no dishes. Check another section or contact the kitchen."
          action={
            <Link
              href="/menu"
              className="text-sm font-medium text-plum-600 hover:text-plum-700"
            >
              Back to the full menu
            </Link>
          }
        />
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.id}>
              <DishCard
                item={item}
                currency={currency}
                categoryName={category.name_en}
                priority={index < 3}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
