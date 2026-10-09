"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminButtonAction, AdminForm, Field } from "@/components/admin/form-kit";
import {
  deleteModifierGroupAction,
  deleteModifierOptionAction,
  saveModifierGroupAction,
  saveModifierOptionAction,
  toggleModifierOptionAction,
} from "@/lib/actions/admin";
import { useErrorText, useT } from "@/components/i18n-provider";
import type { AdminModifierGroup } from "@/lib/services/admin-catalog";

/**
 * Extras/options editor for one dish. A group is a question ("Choose up to 2
 * extras"); an option is an answer with an optional price delta. The min/max
 * numbers here are the same ones `place_order` enforces, so what the admin
 * promises is exactly what the customer is allowed to buy.
 *
 * Only meaningful for a saved dish: a group needs a real `menu_items.id`, so
 * the create form hides this until the dish exists.
 */
export function ModifierEditor({
  menuItemId,
  groups,
}: {
  menuItemId: string;
  groups: AdminModifierGroup[];
}) {
  const [addingGroup, setAddingGroup] = useState(false);
  const t = useT();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-ink-900">
          {t("admin.pages.optionsEditor.title")}{" "}
          <span className="text-sm font-normal text-ink-700/60">({groups.length})</span>
        </h3>
        {!addingGroup ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAddingGroup(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            {t("admin.pages.optionsEditor.addGroup")}
          </Button>
        ) : null}
      </div>

      {groups.length === 0 && !addingGroup ? (
        <p className="rounded-xl bg-rice-200/60 px-3 py-2 text-xs text-ink-800">
          {t("admin.pages.optionsEditor.empty")}
        </p>
      ) : null}

      <ul className="space-y-3">
        {groups.map((group) => (
          <li key={group.id} className="rounded-xl border border-ink-900/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">{group.name_en}</p>
                <p className="mt-0.5 text-xs text-ink-700/70">
                  {group.max_select === 1
                    ? t("admin.pages.optionsEditor.chooseOne")
                    : t("admin.pages.optionsEditor.chooseUpTo", { max: group.max_select })}
                  {group.min_select > 0
                    ? ` · ${t("admin.pages.optionsEditor.atLeast", { min: group.min_select })}`
                    : ""}
                  {group.is_required
                    ? ` · ${t("admin.pages.optionsEditor.required")}`
                    : ` · ${t("admin.pages.optionsEditor.optional")}`}
                </p>
              </div>
              <AdminButtonAction
                action={() => deleteModifierGroupAction(group.id)}
                variant="ghost"
                size="sm"
                confirm={t("admin.pages.optionsEditor.deleteGroupConfirm", {
                  name: group.name_en,
                  count: group.modifier_options.length,
                })}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {t("admin.pages.optionsEditor.deleteGroup")}
              </AdminButtonAction>
            </div>

            <ul className="mt-3 space-y-1.5">
              {group.modifier_options.map((option) => (
                <OptionRow key={option.id} option={option} />
              ))}
            </ul>

            <div className="mt-3 border-t border-ink-900/8 pt-3">
              <OptionForm groupId={group.id} />
            </div>
          </li>
        ))}
      </ul>

      {addingGroup ? (
        <div className="rounded-xl border border-miso-500/25 bg-miso-500/5 p-3">
          <GroupForm
            menuItemId={menuItemId}
            onDone={() => setAddingGroup(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One option with its own in-stock switch. The row is kept when it is out of
 * stock — hiding it would lose the name, the price and every past order that
 * referenced it — and `place_order` refuses an unavailable option, so the flag
 * is enforced by the database rather than the label.
 */
function OptionRow({
  option,
}: {
  option: AdminModifierGroup["modifier_options"][number];
}) {
  const router = useRouter();
  const t = useT();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(value: boolean) {
    setBusy(true);
    setError(null);
    const result = await toggleModifierOptionAction(option.id, value);
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    router.refresh();
  }

  return (
    <li className="rounded-lg bg-rice-100/70 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-sm text-ink-900">
          {option.name_en}
          <span className="ms-2 text-xs text-ink-700/70 tabular-nums">
            {Number(option.price_delta) > 0
              ? `+${Number(option.price_delta).toFixed(2)}`
              : t("admin.pages.optionsEditor.included")}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-800">
            <input
              type="checkbox"
              checked={option.is_available}
              disabled={busy}
              onChange={(event) => toggle(event.target.checked)}
              className="size-3.5 accent-vermilion-600"
            />
            {busy ? t("admin.pages.optionsEditor.saving") : t("admin.pages.optionsEditor.inStock")}
          </label>
          <AdminButtonAction
            action={() => deleteModifierOptionAction(option.id)}
            variant="ghost"
            size="sm"
            confirm={t("admin.pages.optionsEditor.removeConfirm", { name: option.name_en })}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            <span className="sr-only">
              {t("admin.pages.optionsEditor.remove", { name: option.name_en })}
            </span>
          </AdminButtonAction>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-chili-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** Inline "add a group" form. Keeps the create form simple: one button reveals it. */
function GroupForm({
  menuItemId,
  onDone,
}: {
  menuItemId: string;
  onDone: () => void;
}) {
  const t = useT();
  return (
    <AdminForm
      action={saveModifierGroupAction}
      submitLabel={t("admin.pages.optionsEditor.groupForm.submit")}
      options={{ successMessage: t("admin.pages.optionsEditor.groupForm.success"), onSuccess: onDone }}
      extraActions={
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t("admin.common.cancel")}
        </Button>
      }
    >
      <input type="hidden" name="menuItemId" value={menuItemId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          name="nameEn"
          label={t("admin.pages.optionsEditor.groupForm.nameEn")}
          placeholder={t("admin.pages.optionsEditor.groupForm.nameEnPlaceholder")}
        />
        <Field name="nameAr" label={t("admin.pages.optionsEditor.groupForm.nameAr")} dir="rtl" />
        <Field
          name="minSelect"
          label={t("admin.pages.optionsEditor.groupForm.min")}
          type="number"
          defaultValue="0"
          hint={t("admin.pages.optionsEditor.groupForm.minHint")}
        />
        <Field
          name="maxSelect"
          label={t("admin.pages.optionsEditor.groupForm.max")}
          type="number"
          defaultValue="1"
          hint={t("admin.pages.optionsEditor.groupForm.maxHint")}
        />
      </div>
    </AdminForm>
  );
}

/** Inline "add an option" form for a group. */
function OptionForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const t = useT();
  return (
    <AdminForm
      action={saveModifierOptionAction}
      submitLabel={t("admin.pages.optionsEditor.optionForm.submit")}
      options={{
        successMessage: t("admin.pages.optionsEditor.optionForm.success"),
        resetOnSuccess: true,
        onSuccess: () => router.refresh(),
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          name="nameEn"
          label={t("admin.pages.optionsEditor.optionForm.nameEn")}
          placeholder={t("admin.pages.optionsEditor.optionForm.nameEnPlaceholder")}
        />
        <Field name="nameAr" label={t("admin.pages.optionsEditor.optionForm.nameAr")} dir="rtl" />
        <Field
          name="priceDelta"
          label={t("admin.pages.optionsEditor.optionForm.price")}
          type="number"
          defaultValue="0"
          hint={t("admin.pages.optionsEditor.optionForm.priceHint")}
        />
      </div>
    </AdminForm>
  );
}
