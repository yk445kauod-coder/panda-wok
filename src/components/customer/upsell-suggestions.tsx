import { Sparkles } from "lucide-react";
import { getPublicMenu, getUpsellRules } from "@/lib/services/catalog";
import { UpsellCard } from "@/components/customer/upsell-card";
import type { MenuItem, UpsellRule } from "@/lib/services/catalog";

/**
 * Resolves the admin-configured upsell rules for a dish. Suggestions are
 * capped and only shown when the dish is genuinely in stock, so the nudge
 * stays useful instead of nagging.
 */
export async function UpsellSuggestions({
  triggerMenuItemId,
  triggerCategoryId,
  currency,
}: {
  triggerMenuItemId: string;
  triggerCategoryId: string;
  currency: string;
}) {
  const [rules, menu] = await Promise.all([getUpsellRules(), getPublicMenu()]);

  const applicable = rules
    .filter((rule) => matches(rule, triggerMenuItemId, triggerCategoryId))
    .sort((a, b) => a.priority - b.priority);

  if (applicable.length === 0) return null;

  const availableItems = menu.items.filter((item) => item.is_available);
  const suggestions: { item: MenuItem; headline: string | null }[] = [];
  const seen = new Set<string>([triggerMenuItemId]);

  for (const rule of applicable) {
    const candidates =
      rule.suggest_kind === "item"
        ? availableItems.filter((i) => i.id === rule.suggest_menu_item_id)
        : availableItems.filter((i) => i.category_id === rule.suggest_category_id);

    for (const candidate of candidates) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      suggestions.push({ item: candidate, headline: rule.headline_en });
      if (suggestions.length >= 3) break;
    }
    if (suggestions.length >= 3) break;
  }

  if (suggestions.length === 0) return null;

  return (
    <section aria-labelledby="upsell-heading" className="mt-6">
      <h2
        id="upsell-heading"
        className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
      >
        <Sparkles className="size-4 text-miso-600" aria-hidden="true" />
        Goes well with this
      </h2>
      <p className="mt-0.5 text-xs text-ink-700/70">
        Optional additions the kitchen suggests. Nothing is added automatically.
      </p>

      <ul className="mt-3 space-y-2">
        {suggestions.map(({ item, headline }) => (
          <li key={item.id}>
            <UpsellCard item={item} headline={headline} currency={currency} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function matches(
  rule: UpsellRule,
  menuItemId: string,
  categoryId: string,
): boolean {
  if (rule.trigger_kind === "item") {
    return rule.trigger_menu_item_id === menuItemId;
  }
  return rule.trigger_category_id === categoryId;
}
