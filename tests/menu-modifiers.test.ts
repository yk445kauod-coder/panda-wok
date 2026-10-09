import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/utils/format";
import {
  modifierGroupSchema,
  modifierOptionSchema,
} from "@/lib/validation/schemas";

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("slugify", () => {
  it("makes a URL-safe slug from a Latin name", () => {
    expect(slugify("Kung Pao Chicken")).toBe("kung-pao-chicken");
  });

  it("strips accents instead of dropping the word", () => {
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  });

  it("collapses runs of separators and trims the edges", () => {
    expect(slugify("  Sweet & Sour  Pork  ")).toBe("sweet-sour-pork");
  });

  it("returns an empty string for scripts without a Latin mapping", () => {
    // The caller keeps the admin's own input in this case rather than saving
    // a meaningless empty slug.
    expect(slugify("دجاج باللوز")).toBe("");
    expect(slugify("中華鍋")).toBe("");
  });

  it("caps the length at the schema limit", () => {
    expect(slugify("a".repeat(200)).length).toBe(80);
  });
});

describe("modifierGroupSchema", () => {
  it("accepts an optional multi-select group", () => {
    const result = modifierGroupSchema.safeParse({
      menuItemId: UUID,
      nameEn: "Add an extra",
      minSelect: 0,
      maxSelect: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a maximum lower than the minimum", () => {
    const result = modifierGroupSchema.safeParse({
      menuItemId: UUID,
      nameEn: "Size",
      minSelect: 2,
      maxSelect: 1,
    });
    expect(result.success).toBe(false);
  });

  it("requires a real dish id", () => {
    const result = modifierGroupSchema.safeParse({
      menuItemId: "not-a-uuid",
      nameEn: "Size",
    });
    expect(result.success).toBe(false);
  });

  it("requires a group name", () => {
    const result = modifierGroupSchema.safeParse({ menuItemId: UUID, nameEn: "" });
    expect(result.success).toBe(false);
  });

  // `is_required` is derived, never submitted: a group that asks a question must
  // force the answer. The owner's rule is that every choice is mandatory.
  it("derives required from a minimum", () => {
    const result = modifierGroupSchema.safeParse({
      menuItemId: UUID,
      nameEn: "Choose your protein",
      minSelect: 1,
      maxSelect: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isRequired).toBe(true);
  });

  it("makes a single-select group mandatory even when submitted with no minimum", () => {
    // The exact hole that let "Chicken" be ordered with no sauce: a radio group
    // saved as optional. A choose-one group always asks exactly one answer, so
    // it is normalised to min 1 and required.
    const result = modifierGroupSchema.safeParse({
      menuItemId: UUID,
      nameEn: "Choose your style",
      minSelect: 0,
      maxSelect: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isRequired).toBe(true);
      expect(result.data.minSelect).toBe(1);
    }
  });

  it("leaves a genuinely optional multi-select group optional", () => {
    const result = modifierGroupSchema.safeParse({
      menuItemId: UUID,
      nameEn: "Add an extra",
      minSelect: 0,
      maxSelect: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isRequired).toBe(false);
  });
});

describe("modifierOptionSchema", () => {
  it("defaults an included option to a zero price delta", () => {
    const result = modifierOptionSchema.safeParse({
      groupId: UUID,
      nameEn: "Extra cheese",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priceDelta).toBe(0);
  });

  it("accepts a surcharge", () => {
    const result = modifierOptionSchema.safeParse({
      groupId: UUID,
      nameEn: "Extra cheese",
      priceDelta: "15.5",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priceDelta).toBe(15.5);
  });
});
