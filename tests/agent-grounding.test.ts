import { describe, expect, it } from "vitest";
import {
  checkGrounded,
  findUngroundedFigures,
  groundedText,
  normaliseDigits,
} from "@/lib/agent/grounding";
import { MCP_PRESETS, getMcpPreset } from "@/lib/agent/mcp-presets";

describe("number grounding", () => {
  it("accepts a figure that a tool actually returned", () => {
    const observations = [{ revenueInWindow: 1250.5, ordersInWindow: 12 }];
    expect(checkGrounded("الإيراد 1250.5 ج.م من 12 أوردر.", observations).ok).toBe(true);
  });

  it("flags money that no tool returned", () => {
    const observations = [{ revenueInWindow: 0 }];
    const verdict = checkGrounded("إيراد النهاردة حوالى 3,400 ج.م، شغل تمام.", observations);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.figures).toContain("3,400");
  });

  it("flags a large bare figure but ignores small counts in prose", () => {
    expect(findUngroundedFigures("عندنا 4200 عميل مسجل.", [{ members: 10 }])).toContain("4200");
    expect(findUngroundedFigures("خلصناها في 3 خطوات.", [])).toEqual([]);
  });

  it("does not treat a year as an invented quantity", () => {
    expect(findUngroundedFigures("التقرير لسنة 2026.", [{ revenue: 0 }])).toEqual([]);
  });

  it("reads Arabic-Indic digits as the same numbers", () => {
    expect(normaliseDigits("٢٠٢٦")).toBe("2026");
    // The offender list reports canonical ASCII digits, even when the prose used Arabic ones.
    // 5000 is outside the year range, so it is a quantity, not a date.
    expect(findUngroundedFigures("الإيراد ٥٠٠٠ ج.م", [{ revenue: 0 }])).toContain("5000");
  });

  it("grounds a comma-formatted answer against a plain-number payload", () => {
    const observations = [{ aov: 1250 }];
    expect(checkGrounded("متوسط الطلب 1,250 ج.م.", observations).ok).toBe(true);
  });

  it("treats currency words after the number as a money claim", () => {
    expect(findUngroundedFigures("خدنا 999 جنيه امبارح.", [{ revenue: 0 }])).toContain("999");
  });

  it("collects nested numbers into the grounded blob", () => {
    const text = groundedText([{ a: { b: [1, 2, 99.5] } }, "opaque 7"]);
    expect(text).toContain("99.5");
    expect(text).toContain("7");
  });
});

describe("MCP connector presets", () => {
  it("ships the connectors the owner asked for", () => {
    const ids = MCP_PRESETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["meta-ads", "github", "supabase"]));
  });

  it("every preset points at an https endpoint with a secret name, never a value", () => {
    for (const preset of MCP_PRESETS) {
      expect(preset.url.startsWith("https://")).toBe(true);
      expect(preset.secretRef).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(preset.docsUrl.startsWith("https://")).toBe(true);
    }
  });

  it("resolves a preset by id", () => {
    expect(getMcpPreset("github")?.url).toContain("githubcopilot.com");
    expect(getMcpPreset("nope")).toBeUndefined();
  });
});
