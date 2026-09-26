import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { en } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { BRAND_SCRIPT_MARK } from "@/lib/brand";

/**
 * The identity band renders the kitchen's live `cuisine_tags`, so the only
 * script mark left is the shared BRAND_SCRIPT_MARK used by the hero plate and
 * the closing brand banner.
 *
 * The shop publishes in English and Arabic only — there is no Japanese
 * anywhere, by request — so the mark names the wok in Chinese and nothing else.
 *
 * The mark renders in the Shippori Mincho face, which is a Japanese Mincho: it
 * ships Japanese glyph forms. A simplified-Chinese-only character (华, 亚) is
 * absent from its subset, so the browser substitutes a different font for that
 * one glyph and the mark renders half in one typeface and half in another.
 *
 * These assertions pin the copy to characters the chosen face actually covers,
 * so the mismatch cannot come back unnoticed.
 */
const COVERED_BY_MINCHO = new Set(["中", "華"]);

describe("identity script marks", () => {
  it("keeps the hero/banner script mark inside the covered glyph set", () => {
    const uncovered = [...BRAND_SCRIPT_MARK].filter(
      (ch) => !COVERED_BY_MINCHO.has(ch) && ch !== "·" && ch !== " ",
    );
    expect(uncovered, `${BRAND_SCRIPT_MARK} contains glyphs outside the subset`).toEqual([]);
    expect(BRAND_SCRIPT_MARK).not.toContain("华");
  });

  it("carries no Japanese in the brand mark", () => {
    expect(BRAND_SCRIPT_MARK).not.toMatch(/[\u3040-\u309f\u30a0-\u30ff]|日本/);
  });

  it("sources every .font-kana script mark from the shared constant", () => {
    // Both the hero plate and the closing brand banner used to hardcode their
    // own copy, so one was fixed and the other kept the broken glyph.
    for (const file of [
      "src/app/(site)/page.tsx",
      "src/components/customer/brand-banner.tsx",
    ]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      const hardcoded = source.match(/font-kana[^>]*>\s*[\u3000-\u9fff]/);
      expect(hardcoded, `${file} hardcodes a CJK string instead of BRAND_SCRIPT_MARK`).toBeNull();
    }
  });

  it("drives the identity band from live cuisine tags, not invented copy", () => {
    const source = readFileSync(
      new URL("../src/components/customer/identity-band.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("cuisineTags");
    expect(source).toContain("BRAND_SCRIPT_MARK");
    // The old hardcoded cuisine claims must not survive in either dictionary.
    for (const dict of [en, ar]) {
      expect(dict.home.identityBody).not.toMatch(/sushi counter|Chinese wok|منصة سوشي|الووك الصيني/);
    }
  });

  it("lists cuisine tags as chips rather than concatenating them into the heading", () => {
    // The heading used to interpolate the whole tag list ("...: Asian ·
    // Japanese-inspired · Chinese-inspired · Wok · Ramen · Sushi · Cloud
    // kitchen"), which read like a keyword dump. The tags are shown once, as
    // chips under the heading, and the heading itself is a plain sentence.
    const source = readFileSync(
      new URL("../src/components/customer/identity-band.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('t("home.identityHeading")');
    expect(source).not.toContain('identityHeading", { cuisine');
    for (const dict of [en, ar]) {
      expect(dict.home.identityHeading).not.toContain("{cuisine}");
    }
  });

  it("has no Japanese name field anywhere in the app", () => {
    // Japanese is not a published language here, so the column, the schema
    // field, the admin input and the customer subtitles were all removed.
    // Grep-style guards stop any of them creeping back.
    const files = [
      "src/lib/services/catalog.ts",
      "src/lib/validation/schemas.ts",
      "src/lib/actions/admin.ts",
      "src/components/admin/menu-item-form.tsx",
      "src/components/admin/category-form.tsx",
      "src/components/customer/dish-detail.tsx",
      "src/components/customer/category-section.tsx",
      "src/components/customer/editorial-sections.tsx",
      "src/app/(site)/menu/page.tsx",
      "src/app/(site)/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source, `${file} still references name_ja/nameJa`).not.toMatch(/name_ja|nameJa/);
      expect(source, `${file} still hardcodes lang="ja"`).not.toContain('lang="ja"');
    }
  });
});
