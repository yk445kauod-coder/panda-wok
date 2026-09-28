import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import {
  getAdminMenuItem,
  getAdminModifierGroups,
  listAdminCategories,
  listAdminMenuItems,
} from "@/lib/services/admin-catalog";
import { MenuItemForm } from "@/components/admin/menu-item-form";
import { MenuItemRow, HiddenNotice } from "@/components/admin/menu-item-row";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Menu CMS. The list and the editor share this route: `?edit=<id>` opens the
 * form for an existing dish, no parameter opens a blank create form.
 */
export default async function AdminMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireCapability("menu.manage");
  const t = await getT(await getAdminLocale());
  const params = await searchParams;

  const [categories, items] = await Promise.all([
    listAdminCategories(),
    listAdminMenuItems({ limit: 400 }),
  ]);

  const editing = params.edit ? await getAdminMenuItem(params.edit) : null;
  const modifierGroups = editing ? await getAdminModifierGroups(editing.id) : [];

  // Group by category, preserving the category sort order, so the list reads
  // like the real menu rather than an unordered table.
  const grouped = categories
    .map((category) => ({
      category,
      items: items.filter((item) => item.category_id === category.id),
    }))
    .filter((group) => group.items.length > 0);

  const orphans = items.filter(
    (item) => !categories.some((category) => category.id === item.category_id),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">{t("admin.pages.menu.title")}</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("admin.pages.menu.description")}
          </p>
        </div>
        <div className="flex gap-2">
          {params.edit ? (
            <Link
              href="/admin/menu"
              className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
            >
              {t("admin.pages.menu.new")}
            </Link>
          ) : null}
          <Link
            href="/admin/categories"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.menu.categories")}
          </Link>
        </div>
      </header>

      <section className="washi-panel p-4" aria-label={editing ? t("admin.pages.menu.edit") : t("admin.pages.menu.create")}>
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {editing ? `${t("admin.pages.menu.edit")} ${editing.name_en}` : t("admin.pages.menu.add")}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {categories.length === 0
            ? "Create a category first — every dish belongs to one."
            : editing
              ? t("admin.pages.menu.update")
              : t("admin.pages.menu.fill")}
        </p>

        <div className="mt-4">
          {categories.length === 0 ? (
            <EmptyState
              title={t("admin.pages.menu.noCategories")}
              description={t("admin.pages.menu.noCategoriesBody")}
              action={
                <Link href="/admin/categories" className="text-sm font-medium text-vermilion-600">
                  Create a category
                </Link>
              }
            />
          ) : (
            <MenuItemForm
              item={editing}
              modifierGroups={modifierGroups}
              categories={categories.map((c) => ({
                id: c.id,
                name_en: c.name_en,
                slug: c.slug,
              }))}
            />
          )}
        </div>
      </section>

      <section aria-label="Dishes">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            All dishes{" "}
            <span className="text-sm font-normal text-ink-700/60">({items.length})</span>
          </h2>
          <Link
            href="/admin/categories"
            className="text-xs font-medium text-vermilion-600 hover:text-vermilion-700"
          >
            {t("admin.pages.menu.reorder")}
          </Link>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title={t("admin.pages.menu.empty")}
            description={t("admin.pages.menu.emptyBody")}
          />
        ) : (
          <div className="space-y-5">
            {grouped.map((group) => (
              <div key={group.category.id}>
                <div className="flex items-center justify-between gap-3 pt-2">
                  <h3 className="font-display text-base font-semibold text-ink-900">
                    {group.category.name_en}{" "}
                    <span className="text-sm font-normal text-ink-700/60">
                      ({group.items.length})
                    </span>
                  </h3>
                  <span className="text-xs text-ink-700/60">
                    /menu/{group.category.slug}
                  </span>
                </div>

                <ul className="mt-2 space-y-2">
                  {group.items.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={{
                        id: item.id,
                        name_en: item.name_en,
                        name_ar: item.name_ar,
                        slug: item.slug,
                        price: Number(item.price),
                        is_available: item.is_available,
                        is_featured: item.is_featured,
                        has_transparent_png: item.has_transparent_png,
                        image_url: item.image_url,
                        category_name: group.category.name_en,
                        stock_status: null,
                      }}
                      categoryName={group.category.name_en}
                    />
                  ))}
                </ul>
              </div>
            ))}

            {orphans.length > 0 ? (
              <div>
                <h3 className="pt-2 font-display text-base font-semibold text-ink-900">
                  {t("admin.pages.menu.uncategorised")}
                </h3>
                <ul className="mt-2 space-y-2">
                  {orphans.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={{
                        id: item.id,
                        name_en: item.name_en,
                        name_ar: item.name_ar,
                        slug: item.slug,
                        price: Number(item.price),
                        is_available: item.is_available,
                        is_featured: item.is_featured,
                        has_transparent_png: item.has_transparent_png,
                        image_url: item.image_url,
                        category_name: null,
                        stock_status: null,
                      }}
                      categoryName={null}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            <HiddenNotice count={0} />
          </div>
        )}
      </section>
    </div>
  );
}
