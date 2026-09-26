"use client";

import { AdminForm, Field, TextArea, Toggle } from "@/components/admin/form-kit";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { saveMenuItemAction } from "@/lib/actions/admin";
import type { AdminMenuItem } from "@/lib/services/admin-catalog";

type Category = { id: string; name_en: string; slug: string };

/**
 * Create/edit form for a dish. The essential fields come first — names,
 * price, categoryand photo — so adding a dish is a handful of inputs. The
 * long tail (attributes, nutrition, SEO) sits folded in "More options",
 * one click away but out of the way for everyday edits.
 */
export function MenuItemForm({
  item,
  categories,
}: {
  item: AdminMenuItem | null;
  categories: Category[];
}) {
  const editing = Boolean(item);

  return (
    <AdminForm
      action={saveMenuItemAction}
      submitLabel={editing ? "Save changes" : "Create dish"}
      options={{ successMessage: editing ? "Dish updated." : "Dish created." }}
    >
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <Field
            name="nameEn"
            label="Name (English)"
            defaultValue={item?.name_en ?? ""}
          />
          <Field name="nameAr" label="Name (Arabic)" defaultValue={item?.name_ar ?? ""} />
          <Field
            name="nameJa"
            label="Name (Japanese)"
            hint="Optional. Shown as a subtitle where it adds character."
            defaultValue={item?.name_ja ?? ""}
          />
          <div>
            <label htmlFor="categoryId" className="block text-sm font-medium text-ink-900">
              Category
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={item?.category_id ?? categories[0]?.id ?? ""}
              className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name_en}
                </option>
              ))}
            </select>
          </div>
          <Field
            name="price"
            label="Price (EGP)"
            hint="The total the customer pays for this dish."
            defaultValue={item ? String(item.price) : ""}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink-900">Photo</label>
          <ImageUploadField initialUrl={item?.image_url ?? null} idSuffix="menu" />
          <Field
            name="imageAlt"
            label="Image alt text"
            hint="Describe the dish for screen readersand image search."
            defaultValue={item?.image_alt ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextArea
          name="descriptionEn"
          label="Description (English)"
          rows={4}
          defaultValue={item?.description_en ?? ""}
        />
        <TextArea
          name="descriptionAr"
          label="Description (Arabic)"
          rows={4}
          defaultValue={item?.description_ar ?? ""}
        />
      </div>

      <details className="group rounded-xl border border-ink-900/10 bg-rice-100/40 p-3">
        <summary className="cursor-pointer select-none text-sm font-semibold text-ink-800">
          More options<span className="ms-1 text-ink-700/60 group-open:rotate-180">v</span>
        </summary>
        <div className="mt-4 space-y-5">
          <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-1 text-sm font-medium text-ink-900">
              Attributes
            </legend>
            <Toggle
              name="isAvailable"
              label="Orderable"
              defaultChecked={item?.is_available ?? true}
              hint="Turn off to hide without archiving."
            />
            <Toggle
              name="isFeatured"
              label="Featured"
              defaultChecked={item?.is_featured ?? false}
              hint="Appears on the home page strip."
            />
            <Toggle
              name="hasTransparentPng"
              label="Transparent PNG"
              defaultChecked={item?.has_transparent_png ?? false}
              hint="Allows the cut-out asset in visual compositions."
            />
            <Toggle
              name="isSpicy"
              label="Spicy"
              defaultChecked={item?.is_spicy ?? false}
            />
            <Toggle
              name="isVegetarian"
              label="Vegetarian"
              defaultChecked={item?.is_vegetarian ?? false}
            />
            <Toggle name="isVegan" label="Vegan" defaultChecked={item?.is_vegan ?? false} />
            <Toggle
              name="containsNuts"
              label="Contains nuts"
              defaultChecked={item?.contains_nuts ?? false}
            />
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Preparationand nutrition</legend>
            <Field
              name="prepMinutes"
              label="Prep minutes"
              defaultValue={String(item?.prep_minutes ?? 15)}
            />
            <Field
              name="calories"
              label="Calories"
              hint="Optional."
              defaultValue={item?.calories ? String(item.calories) : ""}
            />
            <Field
              name="allergens"
              label="Allergens"
              hint="Comma separated, e.g. gluten, soy, sesame"
              defaultValue={(item?.allergens ?? []).join(", ")}
            />
            <Field
              name="ingredients"
              label="Ingredients"
              hint="Comma separated."
              defaultValue={(item?.ingredients ?? []).join(", ")}
            />
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Imagery</legend>
            <Field
              name="slug"
              label="URL slug"
              hint="Used for /menu/your-slug. Lowercase words separated by hyphens."
              defaultValue={item?.slug ?? ""}
            />
            <Field
              name="sortOrder"
              label="Sort order"
              hint="Lower numbers appear first."
              defaultValue={String(item?.sort_order ?? 0)}
            />
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium text-ink-900">
              Search engine listing
            </legend>
            <Field
              name="seoTitle"
              label="SEO title"
              hint="Falls back to the dish name and price."
              defaultValue={item?.seo_title ?? ""}
            />
            <Field
              name="seoDescription"
              label="SEO description"
              defaultValue={item?.seo_description ?? ""}
            />
            <Field
              name="seoKeywords"
              label="Keywords"
              hint="Comma separated."
              defaultValue={(item?.seo_keywords ?? []).join(", ")}
            />
          </fieldset>
        </div>
      </details>
    </AdminForm>
  );
}
