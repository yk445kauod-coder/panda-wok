"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { Badge, Button } from "@/components/ui/button";
import { useCart } from "@/components/customer/cart-provider";
import { trackEvent } from "@/components/customer/analytics-beacon";
import { formatPrice } from "@/lib/utils/format";
import type { MenuItemDetail } from "@/lib/services/catalog";

/**
 * Add-to-cart for a dish, including its modifier groups. Required groups must
 * be satisfied before the button enables, and per-item maximums are enforced
 * client-side as a courtesy while the server re-validates on submit.
 */
export function AddToCartPanel({
  dish,
  currency,
}: {
  dish: MenuItemDetail;
  currency: string;
}) {
  void currency;

  const { add, lines, hydrated } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");
  const [justAdded, setJustAdded] = useState(false);

  const groups = useMemo(() => dish.modifier_groups ?? [], [dish.modifier_groups]);

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
            name: option.name_en,
            priceDelta: Number(option.price_delta),
          });
        }
      }
    }
    return out;
  }, [groups, selected]);

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
        name: dish.name_en,
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
          This dish is unavailable right now.
        </p>
        <p className="mt-1 text-xs text-ink-700/80">
          The kitchen has either run out or paused it. Please pick another dish, or try
          again later.
        </p>
        <Link
          href="/menu"
          className="mt-3 inline-block text-sm font-medium text-plum-600 hover:text-plum-700"
        >
          Browse the rest of the menu
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {groups.map((group) => (
        <fieldset key={group.id} className="rounded-xl border border-ink-900/10 p-3.5">
          <legend className="px-1 text-sm font-semibold text-ink-900">
            {group.name_en}
            {group.is_required ? (
              <span className="ml-2 align-middle">
                <Badge tone="warning">Required</Badge>
              </span>
            ) : (
              <span className="ml-2 text-xs font-normal text-ink-700/60">Optional</span>
            )}
          </legend>
          <p className="mt-0.5 text-xs text-ink-700/65">
            {group.max_select === 1
              ? "Choose one"
              : `Choose up to ${group.max_select}`}
            {group.min_select > 1 ? `, at least ${group.min_select}` : ""}
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
                      <span className="text-sm text-ink-900">{option.name_en}</span>
                    </span>
                    {delta !== 0 ? (
                      <span className="text-xs text-ink-700/75">
                        {delta > 0 ? "+" : ""}
                        {formatPrice(delta)}
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
        <label
          htmlFor="dish-notes"
          className="block text-sm font-medium text-ink-900"
        >
          Anything the kitchen should know?
        </label>
        <textarea
          id="dish-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          maxLength={200}
          placeholder="No coriander, less chilli, sauce on the side…"
          className="mt-1.5 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2 text-sm outline-none focus:border-miso-500"
        />
      </div>

      {unmetGroups.length > 0 ? (
        <p role="status" className="text-xs text-miso-600">
          Please finish choosing: {unmetGroups.map((g) => g.name_en).join(", ")}.
        </p>
      ) : null}

      {remaining === 0 ? (
        <p role="status" className="text-xs text-chili-600">
          You already have the maximum of this dish in your basket.
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
              aria-label="Decrease quantity"
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
              aria-label="Increase quantity"
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
                Added
              </>
            ) : (
              <>
                <ShoppingBag className="size-4" aria-hidden="true" />
                Add · {formatPrice(lineTotal)}
              </>
            )}
          </Button>
        </div>

        <p className="mt-2 text-center text-[11px] text-ink-700/60">
          Prices are confirmed on the server when you place the order.
        </p>
      </div>
    </div>
  );
}
