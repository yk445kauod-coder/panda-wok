"use client";

import { useState } from "react";
import { AdminForm, Field, Toggle } from "@/components/admin/form-kit";
import { saveUpsellRuleAction } from "@/lib/actions/admin";
import type { Database } from "@/lib/types/database";

export type UpsellOption = { id: string; name_en: string };

type Rule = Database["public"]["Tables"]["upsell_rules"]["Row"];

/**
 * Create/edit form for an upsell rule. The trigger and suggestion can each
 * point at a single dish or a whole category; the target select swaps with the
 * kind so a rule can never be saved with the two out of step.
 */
export function UpsellRuleForm({
  rule,
  items,
  categories,
}: {
  rule: Rule | null;
  items: UpsellOption[];
  categories: UpsellOption[];
}) {
  const editing = Boolean(rule);
  const [triggerKind, setTriggerKind] = useState(rule?.trigger_kind ?? "category");
  const [suggestKind, setSuggestKind] = useState(rule?.suggest_kind ?? "item");

  const triggerValue =
    (triggerKind === "item" ? rule?.trigger_menu_item_id : rule?.trigger_category_id) ?? "";
  const suggestValue =
    (suggestKind === "item" ? rule?.suggest_menu_item_id : rule?.suggest_category_id) ?? "";

  return (
    <AdminForm
      action={saveUpsellRuleAction}
      submitLabel={editing ? "Save changes" : "Create rule"}
      options={{ successMessage: editing ? "Rule updated." : "Rule created." }}
    >
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}

      <Field
        name="name"
        label="Rule name"
        hint="Internal label so you can tell rules apart in this list."
        defaultValue={rule?.name ?? ""}
      />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">When and what to suggest</legend>

        <div>
          <label htmlFor="triggerKind" className="block text-sm font-medium text-ink-900">
            When the basket has
          </label>
          <select
            id="triggerKind"
            name="triggerKind"
            value={triggerKind}
            onChange={(event) => setTriggerKind(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="category">A dish from a category</option>
            <option value="item">A specific dish</option>
          </select>
        </div>

        <div>
          <label htmlFor="triggerId" className="block text-sm font-medium text-ink-900">
            Trigger {triggerKind === "item" ? "dish" : "category"}
          </label>
          <select
            id="triggerId"
            name="triggerId"
            defaultValue={triggerValue}
            key={`trigger-${triggerKind}`}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            {(triggerKind === "item" ? items : categories).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name_en}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="suggestKind" className="block text-sm font-medium text-ink-900">
            Suggest a
          </label>
          <select
            id="suggestKind"
            name="suggestKind"
            value={suggestKind}
            onChange={(event) => setSuggestKind(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="item">Specific dish</option>
            <option value="category">Dish from a category</option>
          </select>
        </div>

        <div>
          <label htmlFor="suggestId" className="block text-sm font-medium text-ink-900">
            Suggested {suggestKind === "item" ? "dish" : "category"}
          </label>
          <select
            id="suggestId"
            name="suggestId"
            defaultValue={suggestValue}
            key={`suggest-${suggestKind}`}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            {(suggestKind === "item" ? items : categories).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name_en}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Copy and ordering</legend>
        <Field
          name="headlineEn"
          label="Headline (English)"
          hint="Optional nudge shown above the suggestion."
          defaultValue={rule?.headline_en ?? ""}
        />
        <Field
          name="headlineAr"
          label="Headline (Arabic)"
          dir="rtl"
          defaultValue={rule?.headline_ar ?? ""}
        />
        <Field
          name="priority"
          label="Priority"
          type="number"
          hint="Lower numbers are tried first. Keep only a few rules on the same dish."
          defaultValue={String(rule?.priority ?? 0)}
        />
      </fieldset>

      <Toggle
        name="isEnabled"
        label="Rule active"
        defaultChecked={rule?.is_enabled ?? true}
        hint="Inactive rules stay here but never reach customers."
      />
    </AdminForm>
  );
}
