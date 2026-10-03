import { describe, expect, it } from "vitest";
import { extractMemoryCandidates, lexicalSimilarity, renderMemoryContext } from "@/lib/agent/memory";

/**
 * The pure half of the memory layer: candidate extraction (what is worth
 * remembering) and the lexical ranking used when no embedding service is
 * reachable. No network, no database.
 */
describe("memory candidate extraction", () => {
  it("keeps an explicit Arabic remember instruction", () => {
    const out = extractMemoryCandidates("افتكر إن الجمعة أكتر يوم زحمة");
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("owner_note");
    // The instruction is stripped, so the memory reads as the fact.
    expect(out[0].content).toContain("الجمعة");
    expect(out[0].content).not.toMatch(/^افتكر/);
  });

  it("keeps an English remember instruction", () => {
    const out = extractMemoryCandidates("Remember: we never discount the sushi combos.");
    expect(out).toHaveLength(1);
    expect(out[0].content).toContain("discount the sushi combos");
  });

  it("ignores an ordinary question", () => {
    expect(extractMemoryCandidates("كام طلب النهاردة؟")).toHaveLength(0);
    expect(extractMemoryCandidates("what were yesterday's sales?")).toHaveLength(0);
  });

  it("ignores a too-short fragment", () => {
    expect(extractMemoryCandidates("remember")).toHaveLength(0);
  });

  it("caps the stored content length", () => {
    const long = `افتكر ${"ا".repeat(2000)}`;
    const out = extractMemoryCandidates(long);
    expect(out[0].content.length).toBeLessThanOrEqual(800);
  });
});

describe("lexical similarity (embedding-free fallback)", () => {
  it("is 1 for identical text and 0 for disjoint text", () => {
    expect(lexicalSimilarity("the menu has 84 dishes", "the menu has 84 dishes")).toBeCloseTo(1, 5);
    expect(lexicalSimilarity("the menu has 84 dishes", "loyalty points expire")).toBe(0);
  });

  it("is symmetric and ranks a related sentence above an unrelated one", () => {
    const query = "menu dishes count";
    const related = lexicalSimilarity(query, "the menu has 84 dishes in 19 categories");
    const unrelated = lexicalSimilarity(query, "customer lifetime value report");
    expect(related).toBeGreaterThan(unrelated);
    expect(lexicalSimilarity(query, "the menu has 84 dishes")).toBeCloseTo(
      lexicalSimilarity("the menu has 84 dishes", query),
      10,
    );
  });

  it("normalises Arabic diacritics so a vocalised word still matches", () => {
    expect(lexicalSimilarity("الجمعة", "الجُمُعَة")).toBeGreaterThan(0.9);
  });
});

describe("renderMemoryContext", () => {
  it("renders one line per memory and nothing for an empty list", () => {
    expect(renderMemoryContext([])).toBe("");
    const block = renderMemoryContext([
      { kind: "owner_note", content: "Fridays are busiest" },
      { kind: "ops_report", content: "Revenue fell 10%" },
    ]);
    expect(block.split("\n")).toHaveLength(2);
    expect(block).toContain("(owner_note)");
  });
});
