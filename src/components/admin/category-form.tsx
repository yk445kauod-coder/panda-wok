"use client";

import { AdminForm, Field, TextArea, Toggle } from "@/components/admin/form-kit";
import { saveCategoryAction } from "@/lib/actions/admin";
import type { AdminCategory } from "@/lib/services/admin-catalog";

/**
 * Create/edit form for a category. Ordering is deliberately not editable here:
 * the list offers explicit move up/down controls so two people reordering at
 * once cannot silently overwrite each other with a stale number.
 */
export function CategoryForm({ category }: { category: AdminCategory | null }) {
  const editing = Boolean(category);

  return (
    <AdminForm
      action={saveCategoryAction}
      submitLabel={editing ? "Save changes" : "Create category"}
      options={{ successMessage: editing ? "Category updated." : "Category created." }}
    >
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Names and URL</legend>
        <Field
          name="nameEn"
          label="Name (English)"
          defaultValue={category?.name_en ?? ""}
        />
        <Field
          name="nameAr"
          label="Name (Arabic)"
          hint="Shown in Arabic layouts, right to left."
          dir="rtl"
          defaultValue={category?.name_ar ?? ""}
        />
        <Field
          name="nameJa"
          label="Name (Japanese)"
          hint="Optional subtitle on the public menu."
          defaultValue={category?.name_ja ?? ""}
        />
        <Field
          name="slug"
          label="URL slug"
          hint="Public address: /menu/your-slug. Lowercase words separated by hyphens."
          defaultValue={category?.slug ?? ""}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Descriptions</legend>
        <TextArea
          name="descriptionEn"
          label="Description (English)"
          rows={3}
          defaultValue={category?.description_en ?? ""}
        />
        <TextArea
          name="descriptionAr"
          label="Description (Arabic)"
          rows={3}
          defaultValue={category?.description_ar ?? ""}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Imagery and search listing</legend>
        <Field
          name="imageUrl"
          label="Image URL"
          hint="External URL or a Supabase Storage public URL."
          defaultValue={category?.image_url ?? ""}
        />
        <Field
          name="sortOrder"
          label="Sort order"
          hint={
            editing
              ? "Lower numbers appear first. Use the arrows in the list for quick nudges."
              : "Lower numbers appear first."
          }
          defaultValue={String(category?.sort_order ?? 0)}
        />
        <Field
          name="seoTitle"
          label="SEO title"
          hint="Falls back to the category name."
          defaultValue={category?.seo_title ?? ""}
        />
        <Field
          name="seoDescription"
          label="SEO description"
          defaultValue={category?.seo_description ?? ""}
        />
      </fieldset>

      <Toggle
        name="isEnabled"
        label="Visible to customers"
        defaultChecked={category?.is_enabled ?? true}
        hint="Turn off to keep the category and its dishes out of the public menu."
      />
    </AdminForm>
  );
}
