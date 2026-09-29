import Link from "next/link";
import { ArrowUpDown } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { listAdminCategories, type AdminCategory } from "@/lib/services/admin-catalog";
import { CategoryForm } from "@/components/admin/category-form";
import { CategoryList, type CategoryRow } from "@/components/admin/category-list";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Category admin. `?edit=<id>` preloads the form; without it the form creates a
 * new category. The list below owns ordering so the two never fight.
 */
export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireCapability("menu.manage");
  const params = await searchParams;
  const t = await getT(await getAdminLocale());

  const categories = await listAdminCategories();
  const editing: AdminCategory | null = params.edit
    ? (categories.find((category) => category.id === params.edit) ?? null)
    : null;

  const rows: CategoryRow[] = categories.map((category) => ({
    id: category.id,
    name_en: category.name_en,
    name_ar: category.name_ar,
    slug: category.slug,
    is_enabled: category.is_enabled,
    sort_order: category.sort_order,
    item_count: category.item_count,
  }));

  const hidden = categories.filter((category) => !category.is_enabled).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {t("admin.pages.categories.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("admin.pages.categories.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {params.edit ? (
            <Link
              href="/admin/categories"
              className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
            >
              {t("admin.pages.categories.newCategory")}
            </Link>
          ) : null}
          <Link
            href="/admin/menu"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.categories.manageDishes")}
          </Link>
        </div>
      </header>

      <section
        className="washi-panel p-4"
        aria-label={
          editing
            ? t("admin.pages.categories.editCategory")
            : t("admin.pages.categories.createCategory")
        }
      >
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {editing
            ? t("admin.pages.categories.editHeading", { name: editing.name_en })
            : t("admin.pages.categories.addHeading")}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {editing
            ? t("admin.pages.categories.editHint")
            : t("admin.pages.categories.createHint")}
        </p>
        <div className="mt-4">
          <CategoryForm category={editing} />
        </div>
      </section>

      <section aria-label={t("admin.pages.categories.all")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
            <ArrowUpDown className="size-4 text-ink-700/60" aria-hidden="true" />
            {t("admin.pages.categories.all")}{" "}
            <span className="text-sm font-normal text-ink-700/60">
              ({formatNumber(categories.length)})
            </span>
          </h2>
          {hidden > 0 ? (
            <span className="text-xs text-ink-700/70">
              {t("admin.pages.categories.hiddenCount", { count: formatNumber(hidden) })}
            </span>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={t("admin.pages.categories.empty")}
            description={t("admin.pages.categories.emptyBody")}
          />
        ) : (
          <CategoryList categories={rows} />
        )}
      </section>
    </div>
  );
}
