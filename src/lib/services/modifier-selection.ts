/**
 * Pure modifier-selection rules for a dish. Extracted from the add-to-cart
 * component so the "Choose up to N" contract can be unit-tested for zero, one,
 * two and three selections, and so the client rule is stated once.
 *
 * The database re-enforces the same limits inside place_order; this is the
 * courtesy layer that keeps the UI honest.
 */

export type Selection = Record<string, string[]>;

export type ToggleResult = {
  selection: Selection;
  /** True when the tap was refused because the group is already at max. */
  rejected: boolean;
};

/**
 * Applies a checkbox/radio tap. A single-select group replaces its selection;
 * a multi-select group at `max` refuses the extra option rather than silently
 * dropping an earlier choice the customer made.
 */
export function toggleModifierOption(
  selection: Selection,
  groupId: string,
  optionId: string,
  max: number,
): ToggleResult {
  const existing = selection[groupId] ?? [];

  if (existing.includes(optionId)) {
    return {
      selection: { ...selection, [groupId]: existing.filter((id) => id !== optionId) },
      rejected: false,
    };
  }

  if (max === 1) {
    return { selection: { ...selection, [groupId]: [optionId] }, rejected: false };
  }

  if (existing.length >= max) {
    return { selection, rejected: true };
  }

  return { selection: { ...selection, [groupId]: [...existing, optionId] }, rejected: false };
}

/** Number of options selected for a group. */
export function selectionCount(selection: Selection, groupId: string): number {
  return (selection[groupId] ?? []).length;
}
