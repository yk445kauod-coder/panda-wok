import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import {
  getAdminMenuItem,
  listAdminCategories,
  listAdminMenuItems,
} from "@/lib/services/admin-catalog";
import { MenuItemForm } from "@/components/admin/menu-item-form";
import { MenuItemRow, HiddenNotice } from "@/components/admin/menu-item-row";
import { EmptyState } from "@/components/ui/empty-state";

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
  const params = await searchParams;

  const [categories, items] = await Promise.all([
    listAdminCategories(),
    listAdminMenuItems({ limit: 400 }),
  ]);

  const editing = params.edit ? await getAdminMenuItem(params.edit) : null;

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
          <h1 className="text-2xl font-semibold text-ink-900">Menu CMS</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Changes here update the public menu, its metadata and its structured data
            immediately.
          </p>
        </div>
        <div className="flex gap-2">
          {params.edit ? (
            <Link
              href="/admin/menu"
              className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
            >
              New dish
            </Link>
          ) : null}
          <Link
            href="/admin/categories"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            Manage categories
          </Link>
        </div>
      </header>

      <section className="washi-panel p-4" aria-label={editing ? "Edit dish" : "Create a dish"}>
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {editing ? `Edit ${editing.name_en}` : "Add a dish"}
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          {categories.length === 0
            ? "Create a category first — every dish belongs to one."
            : editing
              ? "Update any field and save. The public page picks it up on the next request."
              : "Fill in at least the English name, slug, category and price."}
        </p>

        <div className="mt-4">
          {categories.length === 0 ? (
            <EmptyState
              title="No categories yet"
              description="A dish must belong to a category. Create one, then come back here."
              action={
                <Link href="/admin/categories" className="text-sm font-medium text-indigo-600">
                  Create a category
                </Link>
              }
            />
          ) : (
            <MenuItemForm
              item={editing}
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
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Reorder categories
          </Link>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="The menu is empty"
            description="Add your first dish above. It will appear on the public menu straight away."
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
                  Uncategorised
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
