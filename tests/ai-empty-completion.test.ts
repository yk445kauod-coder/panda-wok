import { describe, expect, it } from "vitest";
import { emptyCompletionMessage } from "@/lib/ai/provider";

/**
 * An empty completion is not one condition. A reasoning model that spends its
 * whole `max_tokens` budget on hidden reasoning answers HTTP 200 with
 * `content: null` and `finish_reason: "length"` — retryable, and very different
 * from a provider outage. The message must say which one happened, because
 * `ai_requests.error` is the only place this surfaces.
 */
describe("emptyCompletionMessage", () => {
  const base = { text: "", promptTokens: 20, completionTokens: 500 };

  it("names reasoning-budget exhaustion when finish_reason is length", () => {
    const message = emptyCompletionMessage("openrouter-free", {
      ...base,
      finishReason: "length",
      reasoningTokens: 500,
    });
    expect(message).toContain("openrouter-free");
    expect(message).toContain("reasoning");
    expect(message).toContain("reasoning_tokens=500");
  });

  it("names it when reasoning tokens consumed the whole completion budget", () => {
    const message = emptyCompletionMessage("openrouter-free", {
      ...base,
      completionTokens: 500,
      reasoningTokens: 500,
    });
    expect(message).toContain("reasoning");
  });

  it("stays plain for a genuine empty answer with no reasoning burn", () => {
    const message = emptyCompletionMessage("workers-ai", {
      ...base,
      completionTokens: 4,
      finishReason: "stop",
      reasoningTokens: 0,
    });
    expect(message).toBe("Provider workers-ai returned an empty completion");
  });
});
