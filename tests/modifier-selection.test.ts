import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  selectionCount,
  toggleModifierOption,
  unmetRequiredGroups,
  type Selection,
} from "@/lib/services/modifier-selection";

const GROUP = "group-1";
const A = "opt-a";
const B = "opt-b";
const C = "opt-c";

describe("toggleModifierOption with max_select = 2", () => {
  it("allows zero selections", () => {
    expect(selectionCount({}, GROUP)).toBe(0);
  });

  it("allows one selection", () => {
    const { selection, rejected } = toggleModifierOption({}, GROUP, A, 2);
    expect(rejected).toBe(false);
    expect(selection[GROUP]).toEqual([A]);
  });

  it("allows two selections", () => {
    const first = toggleModifierOption({}, GROUP, A, 2).selection;
    const { selection, rejected } = toggleModifierOption(first, GROUP, B, 2);
    expect(rejected).toBe(false);
    expect(selection[GROUP]).toEqual([A, B]);
  });

  it("refuses a third selection instead of replacing the first", () => {
    const first = toggleModifierOption({}, GROUP, A, 2).selection;
    const second = toggleModifierOption(first, GROUP, B, 2).selection;
    const { selection, rejected } = toggleModifierOption(second, GROUP, C, 2);
    expect(rejected).toBe(true);
    expect(selection[GROUP]).toEqual([A, B]);
  });

  it("allows a swap after deselecting", () => {
    const two = toggleModifierOption(
      toggleModifierOption({}, GROUP, A, 2).selection,
      GROUP,
      B,
      2,
    ).selection;
    const removed = toggleModifierOption(two, GROUP, A, 2).selection;
    const { selection, rejected } = toggleModifierOption(removed, GROUP, C, 2);
    expect(rejected).toBe(false);
    expect(selection[GROUP]).toEqual([B, C]);
  });
});

describe("toggleModifierOption with max_select = 1", () => {
  it("replaces the current choice", () => {
    const first = toggleModifierOption({}, GROUP, A, 1).selection;
    const { selection } = toggleModifierOption(first, GROUP, B, 1);
    expect(selection[GROUP]).toEqual([B]);
  });
});

describe("selectionCount", () => {
  it("treats a missing group as empty", () => {
    const selection: Selection = {};
    expect(selectionCount(selection, "nope")).toBe(0);
  });
});

/**
 * A required choice must never be satisfied by a hidden default. The panel used
 * to pre-select the first option of a single-select required group, so a box
 * arrived as "rice" when the customer wanted noodles and never chose.
 */
describe("unmetRequiredGroups", () => {
  const riceOrNoodles = { id: "base", min_select: 1 };
  const sauce = { id: "sauce", min_select: 1 };
  const extras = { id: "extras", min_select: 0 };

  it("reports every unfilled required group, not just one", () => {
    const missing = unmetRequiredGroups([riceOrNoodles, sauce], {});
    expect(missing.map((g) => g.id)).toEqual(["base", "sauce"]);
  });

  it("clears a group once it has a selection", () => {
    const missing = unmetRequiredGroups([riceOrNoodles, sauce], {
      base: ["vegetables-noodles"],
    });
    expect(missing.map((g) => g.id)).toEqual(["sauce"]);
  });

  it("is empty when every required group is chosen", () => {
    const missing = unmetRequiredGroups([riceOrNoodles, sauce], {
      base: ["vegetables-noodles"],
      sauce: ["kung-pao"],
    });
    expect(missing).toEqual([]);
  });

  it("ignores optional groups", () => {
    expect(unmetRequiredGroups([extras], {})).toEqual([]);
  });

  it("respects a min_select greater than one", () => {
    const pickTwo = { id: "pick-2", min_select: 2 };
    expect(unmetRequiredGroups([pickTwo], { "pick-2": ["a"] })).toHaveLength(1);
    expect(unmetRequiredGroups([pickTwo], { "pick-2": ["a", "b"] })).toEqual([]);
  });
});

/**
 * The regression that matters: the add-to-cart panel must not choose for the
 * customer. Static checks cannot see an empty `defaults` object whose removal
 * made a required group unfillable, but they can see the auto-select reappear.
 */
describe("add-to-cart panel never auto-selects a required option", () => {
  const source = readFileSync("src/components/customer/add-to-cart-panel.tsx", "utf8");

  it("does not seed a default selection from the first option", () => {
    expect(source).not.toMatch(/defaults\[group\.id\]/);
    expect(source).not.toMatch(/options\[0\]\.id/);
  });

  it("starts from the customer's own selections only", () => {
    expect(source).toMatch(/const selected = useMemo\(\(\) => \(\{ \.\.\.overrides \}\)/);
  });

  it("refuses to add while a required group is unfilled", () => {
    const guard = source.indexOf("if (needsChoice)");
    const addCall = source.indexOf("add(", guard);
    expect(guard).toBeGreaterThan(-1);
    // The guard must come before the cart write, so no unfilled line is added.
    expect(addCall).toBeGreaterThan(guard);
  });
});
