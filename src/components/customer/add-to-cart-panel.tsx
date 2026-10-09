"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { Badge, Button } from "@/components/ui/button";
import { useCart } from "@/components/customer/cart-provider";
import { useT } from "@/components/i18n-provider";
import { trackEvent } from "@/components/customer/analytics-beacon";
import { trackMeta } from "@/components/customer/meta-pixel";
import { formatPrice } from "@/lib/utils/format";
import { unmetRequiredGroups, toggleModifierOption } from "@/lib/services/modifier-selection";
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
  const [atLimit, setAtLimit] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  // When the customer taps "Add" without finishing a required choice, the action
  // is refused and the group is focused and scrolled into view. This is the case
  // the earlier auto-select used to hide; now it is loud, not silent.
  const [showMissingAlert, setShowMissingAlert] = useState(false);

  const groupRefs = useRef<Record<string, HTMLFieldSetElement | null>>({});

  const groups = useMemo(() => dish.modifier_groups ?? [], [dish.modifier_groups]);

  const localName = (record: { name_en: string; name_ar: string | null }) =>
    locale === "ar" && record.name_ar?.trim() ? record.name_ar : record.name_en;

  // Every option starts unselected — including single-option groups and
  // single-select required groups. An earlier version pre-picked the first
  // available option for a `min_select > 0, max_select === 1` group, which
  // quietly made the hidden default the customer's choice: they could tap "Add"
  // without ever deciding and a box would arrive as rice when they wanted
  // noodles. The choice must be the customer's, so nothing is chosen for them.
  const selected = useMemo(() => ({ ...overrides }), [overrides]);

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

  // A required group is "missing" until the customer has chosen enough options.
  // The server enforces the same rule in `place_order`, so this is the visible
  // half of one contract, not a separate client-only check.
  const missingGroups = unmetRequiredGroups(groups, selected);
  const needsChoice = missingGroups.length > 0;

  // A required group whose options are all out of stock cannot be satisfied by any
  // customer action, so ordering is blocked with an explanation rather than
  // leaving a button that can never enable. `place_order` would refuse the
  // order anyway; this makes the reason visible.
  const blockedGroups = groups.filter(
    (group) =>
      group.min_select > 0 &&
      (group.modifier_options ?? []).filter((o) => o.is_available).length < group.min_select,
  );
  const orderBlocked = blockedGroups.length > 0;

  // How many of this dish are already in the basket, to cap the stepper.
  const alreadyInCart = hydrated
    ? lines
        .filter((l) => l.menuItemId === dish.id)
        .reduce((sum, l) => sum + l.quantity, 0)
    : 0;
  const maxPerOrder = 20;
  const remaining = Math.max(0, maxPerOrder - alreadyInCart);

  function toggleOption(groupId: string, optionId: string, max: number) {
    setAtLimit(null);
    setShowMissingAlert(false);
    setOverrides((current) => {
      const { selection, rejected } = toggleModifierOption(
        current,
        groupId,
        optionId,
        max,
      );
      if (rejected) {
        // The extra selection was refused rather than silently replacing an
        // earlier choice: the label promises a maximum the server also enforces.
        setAtLimit(groupId);
      }
      return selection;
    });
  }

  function handleAdd() {
    if (orderBlocked || remaining === 0) return;

    // A required choice the customer has not made is refused, not defaulted.
    // We surface it and move the customer to the group instead of adding a line
    // with a hidden default the kitchen would cook.
    if (needsChoice) {
      setShowMissingAlert(true);
      const first = missingGroups[0];
      if (first) {
        const field = groupRefs.current[first.id];
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
        field?.focus({ preventScroll: true });
      }
      return;
    }

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

    // Standard Meta event so the ad can optimise for "added to cart".
    trackMeta("AddToCart", {
      content_ids: [dish.id],
      content_name: localName(dish),
      content_type: "product",
      value: unitPrice * quantity,
      currency: "EGP",
      quantity,
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
          className="mt-3 inline-block text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
        >
          {t("addToCart.browseRest")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {groups.map((group) => {
        const groupMissing = (selected[group.id]?.length ?? 0) < group.min_select;
        return (
        <fieldset
          key={group.id}
          ref={(el) => {
            groupRefs.current[group.id] = el;
          }}
          tabIndex={-1}
          className={
            groupMissing
              ? "rounded-xl border-2 border-miso-500/70 bg-miso-500/10 p-3.5 outline-none"
              : "rounded-xl border border-ink-900/10 p-3.5 outline-none"
          }
        >
          <legend className="px-1 text-sm font-semibold text-ink-900">
            {localName(group)}
            {group.min_select > 0 ? (
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
              const selectionCount = (selected[group.id] ?? []).length;
              const atMax = group.max_select > 1 && selectionCount >= group.max_select;
              const soldOut = !option.is_available;
              return (
                <li key={option.id}>
                  <label
                    className={
                      soldOut
                        ? "flex cursor-not-allowed items-center justify-between gap-3 rounded-lg px-2 py-2 opacity-55"
                        : "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-rice-200/60"
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type={group.max_select === 1 ? "radio" : "checkbox"}
                        name={`group-${group.id}`}
                        checked={checked}
                        disabled={soldOut || (!checked && atMax)}
                        onChange={() =>
                          toggleOption(group.id, option.id, group.max_select)
                        }
                        className="size-4 accent-vermilion-600 disabled:opacity-50"
                      />
                      <span className="text-sm text-ink-900">{localName(option)}</span>
                      {soldOut ? (
                        <Badge tone="danger">{t("dish.soldOut")}</Badge>
                      ) : null}
                    </span>
                    {delta !== 0 && !soldOut ? (
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
          {atLimit === group.id ? (
            <p role="alert" className="mt-1.5 text-xs text-chili-600">
              {t("addToCart.maxExtras", { count: group.max_select })}
            </p>
          ) : null}
        </fieldset>
        );
      })}

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

      {orderBlocked ? (
        <p role="alert" className="rounded-lg border border-chili-500/30 bg-chili-500/8 px-3 py-2 text-sm font-medium text-chili-700">
          {t("addToCart.soldOutChoice", {
            groups: blockedGroups.map((g) => localName(g)).join("، "),
          })}
        </p>
      ) : showMissingAlert && needsChoice ? (
        <p role="alert" className="rounded-lg border border-miso-500/40 bg-miso-500/10 px-3 py-2 text-sm font-semibold text-miso-700">
          {t("addToCart.choiceRequired", {
            groups: missingGroups.map((g) => localName(g)).join("، "),
          })}
        </p>
      ) : needsChoice ? (
        <p role="status" className="rounded-lg border border-miso-500/40 bg-miso-500/10 px-3 py-2 text-sm font-medium text-miso-700">
          {t("addToCart.finishRequired", {
            groups: missingGroups.map((g) => localName(g)).join("، "),
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
            disabled={orderBlocked || remaining === 0}
            variant={orderBlocked ? "error" : needsChoice ? "warning" : "primary"}
            className="h-11 flex-1"
          >
            {justAdded ? (
              <>
                <Check className="size-4" aria-hidden="true" />
                {t("addToCart.added")}
              </>
            ) : orderBlocked ? (
              <>{t("addToCart.soldOutChoiceShort")}</>
            ) : needsChoice ? (
              <>
                <ShoppingBag className="size-4" aria-hidden="true" />
                {t("addToCart.chooseToContinue")}
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
