import { describe, expect, it } from "vitest";

import { getMenuItemBySlug } from "@/lib/services/catalog";

/**
 * Live probe for the Box choices fix (`20261009000100_box_rice_noodles_options`).
 *
 * The defect: every Box dish carried its "rice or noodles" choice only as prose
 * in `description_en` (`your choice of vegetables noodles or vegetables rice
 * ...`). With no `modifier_groups` row the customer was never asked, nothing was
 * stored, and the kitchen received the box with no idea which base was wanted.
 *
 * This asserts against the live catalogue that each box now exposes a required
 * single-select group, so a regression (a re-import that drops the groups, a
 * manual DB edit) fails loudly instead of silently returning to the old
 * behaviour — the same silent-empty failure mode as the dead ratings view.
 *
 * Skipped unless BOX_OPTIONS_LIVE=1 so the normal suite never hits production.
 */
const live = process.env.BOX_OPTIONS_LIVE === "1";

const BOX_SLUGS = [
  "sweet-sour-chicken-box",
  "spicy-kung-pao-chicken-box",
  "oyster-chicken-box",
  "teriyaki-chicken-box",
  "teriyaki-beef-box",
  "oyster-beef-box",
  "bbq-honey-chili-chicken-box",
  "double-box",
];

describe.skipIf(!live)("box dishes expose their choice as a real option group", () => {
  for (const slug of BOX_SLUGS) {
    it(`${slug} asks rice-or-noodles`, async () => {
      const dish = await getMenuItemBySlug(slug);
      expect(dish, `${slug} must exist`).not.toBeNull();
      const group = dish!.modifier_groups.find((g) => g.name_en === "Rice or noodles");
      expect(group, `${slug} needs a "Rice or noodles" group`).toBeTruthy();
      expect(group!.is_required).toBe(true);
      expect(group!.min_select).toBe(1);
      expect(group!.max_select).toBe(1);
      const options = group!.modifier_options.map((o) => o.name_en).sort();
      expect(options).toEqual(["Vegetables noodles", "Vegetables rice"]);
      // Every option is free: the choice changes the plate, not the price.
      for (const option of group!.modifier_options) {
        expect(Number(option.price_delta)).toBe(0);
        expect(option.is_available).toBe(true);
      }
    });
  }

  it("Double Box also asks for its sauce", async () => {
    const dish = await getMenuItemBySlug("double-box");
    const group = dish!.modifier_groups.find((g) => g.name_en === "Choose your sauce");
    expect(group, "Double Box needs a sauce group").toBeTruthy();
    expect(group!.is_required).toBe(true);
    const options = group!.modifier_options.map((o) => o.name_en).sort();
    expect(options).toEqual(["kung-pao sauce", "oyster sauce", "sweet & sour sauce"]);
  });

  it("every box choice stores an Arabic name as well", async () => {
    for (const slug of BOX_SLUGS) {
      const dish = await getMenuItemBySlug(slug);
      for (const group of dish!.modifier_groups) {
        expect(group.name_ar?.trim(), `${slug} / ${group.name_en} needs Arabic`).toBeTruthy();
        for (const option of group.modifier_options) {
          expect(
            option.name_ar?.trim(),
            `${slug} / ${group.name_en} / ${option.name_en} needs Arabic`,
          ).toBeTruthy();
        }
      }
    }
  });
});
