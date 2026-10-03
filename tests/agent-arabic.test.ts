import { describe, expect, it } from "vitest";
import { isArabic, isRtl, shapeParagraph, visualLine } from "@/lib/agent/arabic";

describe("arabic shaping", () => {
  it("recognises Arabic text", () => {
    expect(isArabic("تقرير")).toBe(true);
    expect(isArabic("report")).toBe(false);
    expect(isRtl("تقرير")).toBe(true);
    expect(isRtl("report")).toBe(false);
    // A mostly-Arabic line with a Latin number is still RTL.
    expect(isRtl("إجمالي 680 EGP")).toBe(true);
  });

  it("shapes a joined word into presentation forms", () => {
    const shaped = shapeParagraph("سلام");
    // Shaped output is Arabic Presentation Forms-B, not the base block.
    expect(/[\ufe70-\ufefc]/.test(shaped)).toBe(true);
    // The isolated base letters must be gone once joined.
    expect(shaped).not.toContain("س");
  });

  it("keeps spaces between Arabic and Latin numbers", () => {
    // Regression: attaching neutrals to the preceding run shifted the boundary
    // space and produced "أوردر2" with the two glued together.
    const visual = visualLine("من 2 أوردر مكتمل");
    expect(visual).toContain(" 2 ");
    expect(visual).not.toContain("2أ");
  });

  it("leaves pure Latin text untouched", () => {
    expect(visualLine("combo fried 8 pieces")).toBe("combo fried 8 pieces");
  });
});
