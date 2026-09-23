"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { Badge, Button } from "@/components/ui/button";
import { useCart } from "@/components/customer/cart-provider";
import { useT } from "@/components/i18n-provider";
import { trackEvent } from "@/components/customer/analytics-beacon";
import { formatPrice } from "@/lib/utils/format";
import type { MenuItemDetail } from "@/lib/services/catalog";
import type { Locale } from "@/lib/i18n/config";

/**
 * Add-to-cart for a dish, including its modifier groups. Required groups must
 * be satisfied before the button enables, and per-item maximums are enforced
 * client-side as a courtesy while the server re-validates on submit.
 *
 * Modifier and dish names follow the active language, so the basket that gets
 * built here carries the name the customer actually read on screen.
 */
export function AddToCartPanel({
  dish,
  currency,
  locale = "en",
}: {
  dish: MenuItemDetail;
  currency: string;
  locale?: Locale;
}) {
  const t = useT();
  const { add, lines, hydrated } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");
  const [justAdded, setJustAdded] = useState(false);

  const groups = useMemo(() => dish.modifier_groups ?? [], [dish.modifier_groups]);

  const localName = (record: { name_en: string; name_ar: string | null }) =>
    locale === "ar" && record.name_ar?.trim() ? record.name_ar : record.name_en;

  // Single-select required groups start on their first option so the required
  // choice is never left blank. Defaults are derived during render rather than
  // written from an effect, so switching dish remounts with the right state and
  // no cascading render is triggered.
  const selected = useMemo(() => {
    const defaults: Record<string, string[]> = {};
    for (const group of groups) {
      const options = group.modifier_options ?? [];
      if (options.length === 0) continue;
      defaults[group.id] =
        group.min_select > 0 && group.max_select === 1 ? [options[0].id] : [];
    }
    return { ...defaults, ...overrides };
  }, [groups, overrides]);

  const chosenModifiers = useMemo(() => {
    const out: { id: string; name: string; priceDelta: number }[] = [];
    for (const group of groups) {
      for (const optionId of selected[group.id] ?? []) {
        const option = group.modifier_options.find((o) => o.id === optionId);
        if (option) {
          out.push({
            id: option.id,
            name: localName(option),
            priceDelta: Number(option.price_delta),
          });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, selected, locale]);

  const unitPrice = Number(dish.price);
  const modifiersTotal = chosenModifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  const lineTotal = (unitPrice + modifiersTotal) * quantity;

  const unmetGroups = groups.filter(
    (group) => (selected[group.id]?.length ?? 0) < group.min_select,
  );

  // How many of this dish are already in the basket, to cap the stepper.
  const alreadyInCart = hydrated
    ? lines
        .filter((l) => l.menuItemId === dish.id)
        .reduce((sum, l) => sum + l.quantity, 0)
    : 0;
  const maxPerOrder = 20;
  const remaining = Math.max(0, maxPerOrder - alreadyInCart);

  function toggleOption(groupId: string, optionId: string, max: number) {
    setOverrides((current) => {
      const existing = current[groupId] ?? [];
      if (existing.includes(optionId)) {
        return { ...current, [groupId]: existing.filter((id) => id !== optionId) };
      }
      if (max === 1) {
        return { ...current, [groupId]: [optionId] };
      }
      if (existing.length >= max) {
        // Replace the oldest selection rather than silently ignoring the tap.
        return { ...current, [groupId]: [...existing.slice(1), optionId] };
      }
      return { ...current, [groupId]: [...existing, optionId] };
    });
  }

  function handleAdd() {
    if (unmetGroups.length > 0 || remaining === 0) return;

    add(
      {
        menuItemId: dish.id,
        slug: dish.slug,
        name: localName(dish),
        nameAr: dish.name_ar,
        unitPrice,
        imageUrl: dish.image_url,
        hasTransparentPng: dish.has_transparent_png,
        modifiers: chosenModifiers,
        notes: notes.trim() || undefined,
        maxQuantity: maxPerOrder,
      },
      quantity,
    );

    trackEvent("CART_ADD", {
      menu_item_id: dish.id,
      slug: dish.slug,
      quantity,
      unit_price: unitPrice,
    });

    setJustAdded(true);
    setQuantity(1);
    setNotes("");
    setTimeout(() => setJustAdded(false), 2200);
  }

  if (!dish.is_available) {
    return (
      <div className="mt-6 rounded-xl border border-chili-500/25 bg-chili-500/8 p-4">
        <p className="text-sm font-medium text-chili-600">
          {t("addToCart.unavailableTitle")}
        </p>
        <p className="mt-1 text-xs text-ink-700/80">{t("addToCart.unavailableBody")}</p>
        <Link
          href="/menu"
          className="mt-3 inline-block text-sm font-medium text-plum-600 hover:text-plum-700"
        >
          {t("addToCart.browseRest")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {groups.map((group) => (
        <fieldset key={group.id} className="rounded-xl border border-ink-900/10 p-3.5">
          <legend className="px-1 text-sm font-semibold text-ink-900">
            {localName(group)}
            {group.is_required ? (
              <span className="ms-2 align-middle">
                <Badge tone="warning">{t("common.required")}</Badge>
              </span>
            ) : (
              <span className="ms-2 text-xs font-normal text-ink-700/60">
                {t("common.optional")}
              </span>
            )}
          </legend>
          <p className="mt-0.5 text-xs text-ink-700/65">
            {group.max_select === 1
              ? t("addToCart.chooseOne")
              : t("addToCart.chooseUpTo", { count: group.max_select })}
            {group.min_select > 1
              ? t("addToCart.chooseAtLeast", { count: group.min_select })
              : ""}
          </p>

          <ul className="mt-2.5 space-y-1.5">
            {group.modifier_options.map((option) => {
              const checked = (selected[group.id] ?? []).includes(option.id);
              const delta = Number(option.price_delta);
              return (
                <li key={option.id}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-rice-200/60">
                    <span className="flex items-center gap-2.5">
                      <input
                        type={group.max_select === 1 ? "radio" : "checkbox"}
                        name={`group-${group.id}`}
                        checked={checked}
                        onChange={() =>
                          toggleOption(group.id, option.id, group.max_select)
                        }
                        className="size-4 accent-plum-600"
                      />
                      <span className="text-sm text-ink-900">{localName(option)}</span>
                    </span>
                    {delta !== 0 ? (
                      <span className="text-xs text-ink-700/75">
                        {delta > 0 ? "+" : ""}
                        {formatPrice(delta, currency, locale)}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}

      <div>
        <label htmlFor="dish-notes" className="block text-sm font-medium text-ink-900">
          {t("addToCart.notesLabel")}
        </label>
        <textarea
          id="dish-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          maxLength={200}
          placeholder={t("addToCart.notesPlaceholder")}
          className="mt-1.5 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2 text-sm outline-none focus:border-miso-500"
        />
      </div>

      {unmetGroups.length > 0 ? (
        <p role="status" className="text-xs text-miso-600">
          {t("addToCart.unfinished", {
            groups: unmetGroups.map((g) => localName(g)).join("، "),
          })}
        </p>
      ) : null}

      {remaining === 0 ? (
        <p role="status" className="text-xs text-chili-600">
          {t("addToCart.maxInBasket")}
        </p>
      ) : null}

      {/* Sticky on mobile so the primary action stays under the thumb. */}
      <div className="sticky bottom-20 z-20 rounded-xl border border-ink-900/10 bg-rice-50/95 p-3 shadow-washi backdrop-blur md:bottom-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-ink-900/12">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label={t("addToCart.decreaseQuantity")}
              className="grid size-11 place-items-center text-ink-800 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <span
              aria-live="polite"
              className="min-w-8 text-center text-sm font-semibold tabular-nums"
            >
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(Math.max(remaining, 1), q + 1))}
              disabled={quantity >= remaining}
              aria-label={t("addToCart.increaseQuantity")}
              className="grid size-11 place-items-center text-ink-800 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>

          <Button
            type="button"
            onClick={handleAdd}
            disabled={unmetGroups.length > 0 || remaining === 0}
            className="h-11 flex-1"
          >
            {justAdded ? (
              <>
                <Check className="size-4" aria-hidden="true" />
                {t("addToCart.added")}
              </>
            ) : (
              <>
                <ShoppingBag className="size-4" aria-hidden="true" />
                {t("addToCart.add", { price: formatPrice(lineTotal, currency, locale) })}
              </>
            )}
          </Button>
        </div>

        <p className="mt-2 text-center text-[11px] text-ink-700/60">
          {t("common.priceNote")}
        </p>
      </div>
    </div>
  );
}
