import { describe, expect, it } from "vitest";
import { salvageToolCalls } from "@/lib/ai/tool-protocol";

/**
 * A weak model writing a call as text used to be a silent no-op: the provider
 * returned no `tool_calls`, so the loop saw an empty turn and reported that
 * nothing happened. These pin the recovery, and — just as important — that it
 * stays conservative.
 */
describe("salvageToolCalls", () => {
  const allowed = ["remember_memory", "create_document", "recall_memory"];

  it("recovers the bracket form the free models emit", () => {
    const { text, toolCalls } = salvageToolCalls(
      '[remember_memory, {"content": "الشحن مجاني فوق 250"}]',
      allowed,
    );
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("remember_memory");
    expect(JSON.parse(toolCalls[0].arguments).content).toBe("الشحن مجاني فوق 250");
    expect(text).toBe("");
  });

  it("recovers a fenced JSON block with name/arguments", () => {
    const { toolCalls } = salvageToolCalls(
      'Sure.\n```json\n{"name": "create_document", "arguments": {"kind": "slide_deck"}}\n```',
      allowed,
    );
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("create_document");
    expect(JSON.parse(toolCalls[0].arguments).kind).toBe("slide_deck");
  });

  it("recovers the prose call form", () => {
    const { toolCalls } = salvageToolCalls(
      'recall_memory({"query": "أوقات العمل"})',
      allowed,
    );
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("recall_memory");
  });

  it("keeps the surrounding prose and removes only the call", () => {
    const { text, toolCalls } = salvageToolCalls(
      'تمام، هسجّلها.\n[remember_memory, {"content": "المطبخ يقفل 1:30"}]\nخلاص.',
      allowed,
    );
    expect(toolCalls).toHaveLength(1);
    expect(text).toContain("تمام");
    expect(text).toContain("خلاص");
    expect(text).not.toContain("remember_memory");
  });

  it("recovers two calls in order", () => {
    const { toolCalls } = salvageToolCalls(
      '[create_document, {"kind": "sales_dashboard"}] and [create_document, {"kind": "slide_deck"}]',
      allowed,
    );
    expect(toolCalls.map((c) => JSON.parse(c.arguments).kind)).toEqual([
      "sales_dashboard",
      "slide_deck",
    ]);
  });

  it("never invents a tool that was not offered", () => {
    // `delete_everything` is not in the allow-list, so it stays prose.
    const { toolCalls } = salvageToolCalls('[delete_everything, {"all": true}]', allowed);
    expect(toolCalls).toHaveLength(0);
  });

  it("ignores a JSON object that merely mentions a tool name as a value", () => {
    const { toolCalls } = salvageToolCalls('{"note": "use remember_memory later"}', allowed);
    expect(toolCalls).toHaveLength(0);
  });

  it("ignores malformed JSON", () => {
    const { toolCalls } = salvageToolCalls("[remember_memory, {content: broken]", allowed);
    expect(toolCalls).toHaveLength(0);
  });

  it("is a no-op on ordinary prose", () => {
    const prose = "أهلاً، إزاي أقدر أساعدك النهاردة؟";
    const result = salvageToolCalls(prose, allowed);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.text).toBe(prose);
  });
});
