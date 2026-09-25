import Link from "next/link";
import { DishCard } from "@/components/customer/dish-card";
import type { MenuItem } from "@/lib/services/catalog";
import type { Locale } from "@/lib/i18n/config";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { en } from "@/lib/i18n/dictionaries/en";
import { makeTranslator } from "@/lib/i18n/translate";

/**
 * Horizontally scrolling strip of featured dishes. On small screens it scrolls
 * with snap points so a thumb can flick through it; on larger screens it lays
 * out as a grid. Server component, so it receives the locale as a prop.
 */
export function FeaturedDishStrip({
  items,
  currency,
  locale,
}: {
  items: MenuItem[];
  currency: string;
  locale: Locale;
}) {
  const t = makeTranslator(locale === "ar" ? ar : en);

  return (
    <div className="-mx-4 mt-4 px-4">
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="w-[76%] shrink-0 snap-start sm:w-auto"
          >
            <DishCard
              item={item}
              currency={currency}
              locale={locale}
              priority={index < 3}
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 text-center sm:hidden">
        <Link
          href="/menu"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {t("home.seeWholeMenu")}
        </Link>
      </div>
    </div>
  );
}

