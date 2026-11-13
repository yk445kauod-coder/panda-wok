import { describe, it, expect } from "vitest";
import {
  checkLineIntegrity,
  type IntegrityGroup,
} from "@/lib/menu/modifier-integrity";

const sizeGroup: IntegrityGroup = {
  id: "g-size",
  is_required: true,
  min_select: 1,
  max_select: 1,
  modifier_options: [
    { id: "opt-4", is_available: true },
    { id: "opt-8", is_available: true },
  ],
};

const extrasGroup: IntegrityGroup = {
  id: "g-extras",
  is_required: false,
  min_select: 0,
  max_select: 2,
  modifier_options: [
    { id: "opt-a", is_available: true },
    { id: "opt-b", is_available: true },
    { id: "opt-c", is_available: false },
  ],
};

describe("checkLineIntegrity", () => {
  it("accepts a line that satisfies a required single-select group", () => {
    const result = checkLineIntegrity([sizeGroup], [{ id: "opt-8" }]);
    expect(result.ok).toBe(true);
    expect(result.missingRequired).toBe(false);
    expect(result.dropIds).toEqual([]);
  });

  it("flags a missing required choice (the reorder / stale-cart case)", () => {
    const result = checkLineIntegrity([sizeGroup], []);
    expect(result.ok).toBe(false);
    expect(result.missingRequired).toBe(true);
  });

  it("treats an unavailable chosen option as no choice at all", () => {
    // opt-c is out of stock: choosing only it leaves the required group empty.
    const required = { ...extrasGroup, is_required: true, min_select: 1 };
    const result = checkLineIntegrity([required], [{ id: "opt-c" }]);
    expect(result.missingRequired).toBe(true);
    expect(result.dropIds).toEqual(["opt-c"]);
  });

  it("drops options the dish no longer offers", () => {
    const result = checkLineIntegrity([extrasGroup], [{ id: "gone" }]);
    expect(result.dropIds).toEqual(["gone"]);
    // The optional group is satisfied with zero choices, so the line is still ok.
    expect(result.ok).toBe(true);
  });

  it("flags a selection over the group maximum", () => {
    const three: IntegrityGroup = {
      id: "g-three",
      is_required: false,
      min_select: 0,
      max_select: 2,
      modifier_options: [
        { id: "a", is_available: true },
        { id: "b", is_available: true },
        { id: "c", is_available: true },
      ],
    };
    const result = checkLineIntegrity([three], [{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(result.stale).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("drops selections when the dish has no groups at all", () => {
    const result = checkLineIntegrity([], [{ id: "anything" }]);
    expect(result.ok).toBe(true);
    expect(result.dropIds).toEqual(["anything"]);
  });

  it("counts distinct selections, not duplicate ids, toward a minimum", () => {
    const multi: IntegrityGroup = {
      id: "g-two",
      is_required: true,
      min_select: 2,
      max_select: 2,
      modifier_options: [
        { id: "x", is_available: true },
        { id: "y", is_available: true },
      ],
    };
    expect(checkLineIntegrity([multi], [{ id: "x" }]).missingRequired).toBe(true);
    expect(
      checkLineIntegrity([multi], [{ id: "x" }, { id: "y" }]).missingRequired,
    ).toBe(false);
  });
});
