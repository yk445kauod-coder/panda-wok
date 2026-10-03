import { describe, expect, it } from "vitest";
import {
  selectionCount,
  toggleModifierOption,
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
