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
} from "@/lib/actions/admin";
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-ink-900">
          Extras &amp; options{" "}
          <span className="text-sm font-normal text-ink-700/60">({groups.length})</span>
        </h3>
        {!addingGroup ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAddingGroup(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add a group
          </Button>
        ) : null}
      </div>

      {groups.length === 0 && !addingGroup ? (
        <p className="rounded-xl bg-rice-200/60 px-3 py-2 text-xs text-ink-800">
          No extras yet. Add a group such as &ldquo;Size&rdquo; or &ldquo;Add an
          extra&rdquo; — customers choose from it on the dish page.
        </p>
      ) : null}

      <ul className="space-y-3">
        {groups.map((group) => (
          <li key={group.id} className="rounded-xl border border-ink-900/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">{group.name_en}</p>
                <p className="mt-0.5 text-xs text-ink-700/70">
                  {group.max_select === 1 ? "Choose one" : `Choose up to ${group.max_select}`}
                  {group.min_select > 0 ? ` · at least ${group.min_select}` : " · optional"}
                  {group.is_required ? " · required" : ""}
                </p>
              </div>
              <AdminButtonAction
                action={() => deleteModifierGroupAction(group.id)}
                variant="ghost"
                size="sm"
                confirm={`Delete "${group.name_en}" and its ${group.modifier_options.length} option(s)?`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete group
              </AdminButtonAction>
            </div>

            <ul className="mt-3 space-y-1.5">
              {group.modifier_options.map((option) => (
                <li
                  key={option.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-rice-100/70 px-2.5 py-1.5"
                >
                  <span className="min-w-0 text-sm text-ink-900">
                    {option.name_en}
                    <span className="ms-2 text-xs text-ink-700/70 tabular-nums">
                      {Number(option.price_delta) > 0
                        ? `+${Number(option.price_delta).toFixed(2)}`
                        : "included"}
                    </span>
                    {!option.is_available ? (
                      <span className="ms-2 text-2xs text-chili-600">hidden</span>
                    ) : null}
                  </span>
                  <AdminButtonAction
                    action={() => deleteModifierOptionAction(option.id)}
                    variant="ghost"
                    size="sm"
                    confirm={`Remove "${option.name_en}"?`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Remove {option.name_en}</span>
                  </AdminButtonAction>
                </li>
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

/** Inline "add a group" form. Keeps the create form simple: one button reveals it. */
function GroupForm({
  menuItemId,
  onDone,
}: {
  menuItemId: string;
  onDone: () => void;
}) {
  return (
    <AdminForm
      action={saveModifierGroupAction}
      submitLabel="Create group"
      options={{ successMessage: "Group added.", onSuccess: onDone }}
      extraActions={
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      }
    >
      <input type="hidden" name="menuItemId" value={menuItemId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="nameEn" label="Group name (English)" placeholder="Add an extra" />
        <Field name="nameAr" label="Group name (Arabic)" dir="rtl" />
        <Field
          name="minSelect"
          label="Minimum"
          type="number"
          defaultValue="0"
          hint="0 = optional."
        />
        <Field
          name="maxSelect"
          label="Maximum"
          type="number"
          defaultValue="1"
          hint="1 = choose one; higher = multi-select."
        />
      </div>
    </AdminForm>
  );
}

/** Inline "add an option" form for a group. */
function OptionForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  return (
    <AdminForm
      action={saveModifierOptionAction}
      submitLabel="Add option"
      options={{
        successMessage: "Option added.",
        resetOnSuccess: true,
        onSuccess: () => router.refresh(),
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="nameEn" label="Option (English)" placeholder="Extra cheese" />
        <Field name="nameAr" label="Option (Arabic)" dir="rtl" />
        <Field
          name="priceDelta"
          label="Price + (EGP)"
          type="number"
          defaultValue="0"
          hint="0 = included."
        />
      </div>
    </AdminForm>
  );
}
