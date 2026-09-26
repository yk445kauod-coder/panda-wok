"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { deleteCategoryAction, reorderCategoryAction } from "@/lib/actions/admin";
import { AdminButtonAction } from "@/components/admin/form-kit";
import { Badge } from "@/components/ui/button";
import type { AdminCategory } from "@/lib/services/admin-catalog";
import { formatNumber } from "@/lib/utils/format";

export type CategoryRow = Pick<
  AdminCategory,
  | "id"
  | "name_en"
  | "name_ar"
  | "slug"
  | "is_enabled"
  | "sort_order"
  | "item_count"
>;

/**
 * Category list with inline reorder and delete. Nudges move a category in
 * steps of ten rather than by one, so there is room to slot a new category
 * between two existing ones without renumbering the whole list.
 */
export function CategoryList({ categories }: { categories: CategoryRow[] }) {
  return (
    <ul className="space-y-2">
      {categories.map((category) => (
        <li key={category.id} className="washi-panel p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">
                  {category.name_en}
                </span>
                {category.name_ar ? (
                  <span className="text-xs text-ink-700/70" dir="rtl">
                    {category.name_ar}
                  </span>
                ) : null}
                {!category.is_enabled ? <Badge tone="danger">Hidden</Badge> : null}
              </div>

              <p className="mt-0.5 text-xs text-ink-700/70">
                <a
                  href={`/menu/${category.slug}`}
                  className="underline decoration-ink-900/20 underline-offset-2 hover:text-ink-900"
                >
                  /menu/{category.slug}
                </a>
                {" · "}
                {formatNumber(category.item_count)}{" "}
                {category.item_count === 1 ? "dish" : "dishes"}
                {" · "}
                position {category.sort_order}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <AdminButtonAction
                action={() => reorderCategoryAction(category.id, category.sort_order - 10)}
                variant="outline"
                size="sm"
              >
                <ArrowUp className="size-3.5" aria-hidden="true" />
                <span className="sr-only">Move {category.name_en} up</span>
                <span aria-hidden="true" className="sm:hidden">
                  Up
                </span>
              </AdminButtonAction>
              <AdminButtonAction
                action={() => reorderCategoryAction(category.id, category.sort_order + 10)}
                variant="outline"
                size="sm"
              >
                <ArrowDown className="size-3.5" aria-hidden="true" />
                <span className="sr-only">Move {category.name_en} down</span>
                <span aria-hidden="true" className="sm:hidden">
                  Down
                </span>
              </AdminButtonAction>

              <Link
                href={`/admin/categories?edit=${category.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-900/15 bg-rice-50/70 px-3 text-sm font-medium text-ink-900 hover:bg-rice-100"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit
              </Link>

              <AdminButtonAction
                action={() => deleteCategoryAction(category.id)}
                variant="ghost"
                size="sm"
                confirm={`Delete ${category.name_en}? It holds ${formatNumber(
                  category.item_count,
                )} dish${category.item_count === 1 ? "" : "es"} — move or archive those dishes first, or the delete will be refused.`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </AdminButtonAction>
            </div>
          </div>

          {category.item_count > 0 ? (
            <p className="mt-2 rounded-lg bg-rice-200/60 px-2.5 py-1.5 text-xs text-ink-800">
              Dishes must be moved to another category (or archived) before this can be
              deleted.
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
