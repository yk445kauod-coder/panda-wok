import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { en } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";
import {
  BRAND_SCRIPT_MARK,
  BRAND_SCRIPT_MARK_JA,
  BRAND_SCRIPT_MARK_ZH,
} from "@/lib/brand";

/**
 * The brand is signed with its name in Chinese and Japanese, rendered in
 * `.font-kana` — a hand-built Shippori Mincho subset covering exactly the
 * glyphs the marks use.
 *
 * That face is a Japanese Mincho, so it ships Japanese glyph forms: a
 * simplified-Chinese-only character (锅, 华) is absent, the browser substitutes a
 * different font for that one glyph, and the mark renders half in one typeface
 * and half in another. These assertions pin the copy to characters the face
 * actually covers, so the mismatch cannot come back unnoticed.
 *
 * The covered set is derived from the same source the font build reads
 * (`scripts/build-kana-font.mjs`), so a mark added there without rebuilding the
 * subset fails here rather than shipping a substituted glyph.
 */
const COVERED = new Set(["熊", "猫", "鍋", "パ", "ン", "ダ"]);

describe("brand script marks", () => {
  it("keeps both marks inside the glyph set the subset covers", () => {
    for (const mark of [BRAND_SCRIPT_MARK_ZH, BRAND_SCRIPT_MARK_JA]) {
      const uncovered = [...mark].filter((ch) => !COVERED.has(ch));
      expect(uncovered, `${mark} contains glyphs outside the subset`).toEqual([]);
    }
  });

  it("names the panda and the wok in both scripts", () => {
    // 熊猫 / パンダ panda, 鍋 the wok — so each mark is the brand, not a fragment.
    expect(BRAND_SCRIPT_MARK_ZH).toBe("熊猫鍋");
    expect(BRAND_SCRIPT_MARK_JA).toBe("パンダ鍋");
  });

  it("uses the traditional form, never the simplified-only one", () => {
    // 锅 has no glyph in the Japanese Mincho; 貓/猫 both do, but 鍋 is the point.
    for (const mark of [BRAND_SCRIPT_MARK_ZH, BRAND_SCRIPT_MARK_JA, BRAND_SCRIPT_MARK]) {
      expect(mark).not.toContain("锅");
      expect(mark).not.toContain("华");
    }
  });

  it("keeps the Chinese mark aliased for older call sites", () => {
    expect(BRAND_SCRIPT_MARK).toBe(BRAND_SCRIPT_MARK_ZH);
  });

  it("sources every .font-kana script mark from the shared component", () => {
    // The hero plate, the brand banner and the identity band each hardcoded
    // their own copy at some point, so one was fixed and another kept a broken
    // glyph. They now all render <BrandScriptMarks/>.
    for (const file of [
      "src/app/(site)/page.tsx",
      "src/components/customer/brand-banner.tsx",
      "src/components/customer/identity-band.tsx",
    ]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source, `${file} should render BrandScriptMarks`).toContain("BrandScriptMarks");
      const hardcoded = source.match(/font-kana[^>]*>\s*[\u3000-\u9fff\u30a0-\u30ff]/);
      expect(hardcoded, `${file} hardcodes a CJK string`).toBeNull();
    }
  });

  it("declares the subset's unicode-range in step with the marks", () => {
    // A range wider than the font file paints tofu; narrower drops a glyph back
    // to a fallback face. Both are silent, so pin every codepoint.
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const range = css.match(/unicode-range:\s*([^;]+);/)?.[1] ?? "";
    const declared = new Set(
      [...range.matchAll(/U\+([0-9A-F]+)/gi)].map((m) => String.fromCodePoint(parseInt(m[1], 16))),
    );
    for (const mark of [BRAND_SCRIPT_MARK_ZH, BRAND_SCRIPT_MARK_JA]) {
      for (const ch of mark) {
        expect(declared.has(ch), `unicode-range is missing ${ch}`).toBe(true);
      }
    }
  });

  it("drives the identity band from live cuisine tags, not invented copy", () => {
    const source = readFileSync(
      new URL("../src/components/customer/identity-band.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("cuisineTags");
    expect(source).toContain("BrandScriptMarks");
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
