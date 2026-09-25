import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";

/**
 * The script badges on the identity band render 日本 / 中華 in the Shippori
 * Mincho face, which is a Japanese Mincho: it ships Japanese glyph forms. A
 * simplified-Chinese-only character (华, 亚) is absent from its subset, so the
 * browser substitutes a different font for that one glyph and the badge renders
 * half in one typeface and half in another.
 *
 * These assertions pin the copy to characters the chosen face actually covers,
 * so the mismatch cannot come back unnoticed.
 */
const COVERED_BY_MINCHO = new Set(["日", "本", "中", "華"]);

describe("identity script badges", () => {
  it("renders only glyphs the Japanese display face covers", () => {
    for (const script of [en.home.identityJapaneseScript, en.home.identityChineseScript]) {
      const uncovered = [...script].filter((ch) => !COVERED_BY_MINCHO.has(ch));
      expect(uncovered, `${script} contains glyphs outside the font subset`).toEqual([]);
    }
  });

  it("keeps the Japanese badge as the country name in Japanese", () => {
    expect(en.home.identityJapaneseScript).toBe("日本");
  });

  it("uses the traditional Chinese form the face ships, not the simplified one", () => {
    expect(en.home.identityChineseScript).toBe("中華");
    expect(en.home.identityChineseScript).not.toContain("华");
  });

  it("uses Arabic country names for the Arabic locale", () => {
    // Arabic copy is the country name in Arabic; the component tags its `lang`
    // accordingly so it is not read aloud with a Japanese voice.
    expect(ar.home.identityJapaneseScript).toBe("اليابان");
    expect(ar.home.identityChineseScript).toBe("الصين");
  });
});
