/**
 * Cart-line integrity against a dish's *current* modifier groups.
 *
 * A basket line is a snapshot taken when the dish was added; the menu can move
 * underneath it. When a single-select group becomes required (see
 * `20261009120000_every_choice_is_mandatory.sql`), a line added before that
 * change carries no selection, and `place_order` rejects it with
 * `VALIDATION:<dish>` — a generic "some details are not valid" the customer
 * cannot act on. The same happens when a chosen option is later marked
 * unavailable: `place_order` silently drops it, which can leave a required
 * group unsatisfied.
 *
 * This decides, purely and synchronously, whether a line still satisfies the
 * dish's rules, so the basket can name the exact problem *before* checkout
 * instead of failing at submit. The database stays authoritative; this only
 * surfaces what it would reject.
 */

export type IntegrityOption = {
  id: string;
  is_available: boolean;
};

export type IntegrityGroup = {
  id: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  modifier_options: IntegrityOption[];
};

/** The minimum a cart line must expose to be checked. */
export type SelectedModifier = { id: string };

export type LineIntegrity = {
  /** True when the line can be placed as-is. */
  ok: boolean;
  /** A required group has fewer available selections than its minimum. */
  missingRequired: boolean;
  /** The selection exceeds a group's maximum, or names options the dish no longer offers. */
  stale: boolean;
  /**
   * Selected ids the dish no longer offers (removed or out of stock). They are
   * dropped by `place_order` and should be pruned from the line so the basket
   * shows what will actually be ordered.
   */
  dropIds: string[];
};

/**
 * Whether a line satisfies every group rule for its dish. `groups` is the
 * dish's live group list; `selected` is the line's chosen options.
 */
export function checkLineIntegrity(
  groups: readonly IntegrityGroup[],
  selected: readonly SelectedModifier[],
): LineIntegrity {
  // Option id -> its group, for the options that are currently available. An
  // unavailable option counts for nothing: `place_order` ignores it entirely.
  const groupOfAvailableOption = new Map<string, IntegrityGroup>();
  for (const group of groups) {
    for (const option of group.modifier_options) {
      if (option.is_available) groupOfAvailableOption.set(option.id, group);
    }
  }

  // `place_order` counts *distinct* option ids per group, so a repeated id must
  // not be counted twice here either.
  const chosenPerGroup = new Map<string, Set<string>>();
  const dropIds: string[] = [];
  for (const { id } of selected) {
    const group = groupOfAvailableOption.get(id);
    if (!group) {
      dropIds.push(id);
      continue;
    }
    const set = chosenPerGroup.get(group.id) ?? new Set<string>();
    set.add(id);
    chosenPerGroup.set(group.id, set);
  }

  let missingRequired = false;
  let stale = false;
  for (const group of groups) {
    const chosen = chosenPerGroup.get(group.id)?.size ?? 0;
    if (group.is_required && chosen < group.min_select) missingRequired = true;
    if (chosen > group.max_select) stale = true;
  }

  return {
    ok: !missingRequired && !stale,
    dropIds,
    missingRequired,
    stale,
  };
}
