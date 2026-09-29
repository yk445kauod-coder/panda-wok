"use client";

import { AdminForm, Field, SlugField, TextArea, Toggle } from "@/components/admin/form-kit";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { saveCategoryAction } from "@/lib/actions/admin";
import type { AdminCategory } from "@/lib/services/admin-catalog";
import { useT } from "@/components/i18n-provider";

/**
 * Create/edit form for a category. Ordering is deliberately not editable here:
 * the list offers explicit move up/down controls so two people reordering at
 * once cannot silently overwrite each other with a stale number.
 */
export function CategoryForm({ category }: { category: AdminCategory | null }) {
  const t = useT();
  const editing = Boolean(category);

  return (
    <AdminForm
      action={saveCategoryAction}
      submitLabel={
        editing
          ? t("admin.pages.categories.form.submitEdit")
          : t("admin.pages.categories.form.submitCreate")
      }
      options={{
        successMessage: editing
          ? t("admin.pages.categories.form.updated")
          : t("admin.pages.categories.form.created"),
      }}
    >
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">
          {t("admin.pages.categories.form.namesLegend")}
        </legend>
        <Field
          name="nameEn"
          label={t("admin.pages.categories.form.nameEn")}
          defaultValue={category?.name_en ?? ""}
        />
        <Field
          name="nameAr"
          label={t("admin.pages.categories.form.nameAr")}
          hint={t("admin.pages.categories.form.nameArHint")}
          dir="rtl"
          defaultValue={category?.name_ar ?? ""}
        />
        <SlugField
          sourceName="nameEn"
          hint={t("admin.pages.categories.form.slugHint")}
          defaultValue={category?.slug ?? ""}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">
          {t("admin.pages.categories.form.descriptionsLegend")}
        </legend>
        <TextArea
          name="descriptionEn"
          label={t("admin.pages.categories.form.descriptionEn")}
          rows={3}
          defaultValue={category?.description_en ?? ""}
        />
        <TextArea
          name="descriptionAr"
          label={t("admin.pages.categories.form.descriptionAr")}
          rows={3}
          defaultValue={category?.description_ar ?? ""}
        />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-ink-900">
            {t("admin.pages.categories.form.photo")}
          </label>
          <ImageUploadField initialUrl={category?.image_url ?? null} idSuffix="category" />
        </div>
        <Field
          name="sortOrder"
          label={t("admin.pages.categories.form.sortOrder")}
          hint={
            editing
              ? t("admin.pages.categories.form.sortOrderHintEdit")
              : t("admin.pages.categories.form.sortOrderHint")
          }
          defaultValue={String(category?.sort_order ?? 0)}
        />
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">
          {t("admin.pages.categories.form.seoLegend")}
        </legend>
        <Field
          name="seoTitle"
          label={t("admin.pages.categories.form.seoTitle")}
          hint={t("admin.pages.categories.form.seoTitleHint")}
          defaultValue={category?.seo_title ?? ""}
        />
        <Field
          name="seoDescription"
          label={t("admin.pages.categories.form.seoDescription")}
          defaultValue={category?.seo_description ?? ""}
        />
      </fieldset>

      <Toggle
        name="isEnabled"
        label={t("admin.pages.categories.form.enabled")}
        defaultChecked={category?.is_enabled ?? true}
        hint={t("admin.pages.categories.form.enabledHint")}
      />
    </AdminForm>
  );
}
