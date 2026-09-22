"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteUpsellRuleAction } from "@/lib/actions/admin";
import { AdminButtonAction } from "@/components/admin/form-kit";
import { Badge } from "@/components/ui/button";
import { cn } from "@/lib/utils/format";
import type { Database } from "@/lib/types/database";

export type UpsellRuleRow = Database["public"]["Tables"]["upsell_rules"]["Row"];

/** Resolves a stored trigger/suggestion id to the name staff recognise. */
export type NameLookup = {
  itemName: (id: string | null) => string | null;
  categoryName: (id: string | null) => string | null;
};

function describe(
  kind: string,
  itemId: string | null,
  categoryId: string | null,
  lookup: NameLookup,
): string {
  if (kind === "item") return lookup.itemName(itemId) ?? "Unknown dish";
  return lookup.categoryName(categoryId) ?? "Unknown category";
}

/**
 * Upsell rule list. Anything pointing at a dish or category that no longer
 * exists is called out rather than hidden, so dead rules can be cleaned up.
 */
export function UpsellRuleList({
  rules,
  lookup,
}: {
  rules: UpsellRuleRow[];
  lookup: NameLookup;
}) {
  return (
    <ul className="space-y-2">
      {rules.map((rule) => {
        const triggerMissing =
          rule.trigger_kind === "item"
            ? !lookup.itemName(rule.trigger_menu_item_id)
            : !lookup.categoryName(rule.trigger_category_id);
        const suggestMissing =
          rule.suggest_kind === "item"
            ? !lookup.itemName(rule.suggest_menu_item_id)
            : !lookup.categoryName(rule.suggest_category_id);

        return (
          <li key={rule.id} className="washi-panel p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">{rule.name}</span>
                  {rule.is_enabled ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Off</Badge>
                  )}
                  <Badge tone="plum">Priority {rule.priority}</Badge>
                  {triggerMissing || suggestMissing ? (
                    <Badge tone="danger">Missing target</Badge>
                  ) : null}
                </div>

                <p className="mt-1 text-xs text-ink-800">
                  <span className="text-ink-700/70">
                    {rule.trigger_kind === "item" ? "Dish" : "Category"}
                  </span>{" "}
                  <span className="font-medium">
                    {describe(
                      rule.trigger_kind,
                      rule.trigger_menu_item_id,
                      rule.trigger_category_id,
                      lookup,
                    )}
                  </span>
                  <span aria-hidden="true" className="mx-1 text-ink-700/60">
                    →
                  </span>
                  <span className="sr-only">suggests</span>
                  <span className="text-ink-700/70">
                    {rule.suggest_kind === "item" ? "Dish" : "Category"}
                  </span>{" "}
                  <span className="font-medium">
                    {describe(
                      rule.suggest_kind,
                      rule.suggest_menu_item_id,
                      rule.suggest_category_id,
                      lookup,
                    )}
                  </span>
                </p>

                {rule.headline_en ? (
                  <p className="mt-1 text-xs italic text-ink-700/75">
                    “{rule.headline_en}”
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Link
                  href={`/admin/upsell?edit=${rule.id}`}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-900/15",
                    "bg-rice-50/70 px-3 text-sm font-medium text-ink-900 hover:bg-rice-100",
                  )}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit
                </Link>
                <AdminButtonAction
                  action={() => deleteUpsellRuleAction(rule.id)}
                  variant="ghost"
                  size="sm"
                  confirm={`Delete the rule “${rule.name}”? Customers stop seeing it straight away.`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Delete
                </AdminButtonAction>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}