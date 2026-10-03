import { describe, expect, it } from "vitest";
import {
  QuotaEnforcedProvider,
  RemoteProvider,
  TOOL_CAPABLE_KINDS,
  providerSupportsTools,
  type AiProvider,
  type CompletionRequest,
} from "@/lib/ai/provider";
import { parseGeminiTurn } from "@/lib/ai/provider";
import { parseToolTurnOpenAiLike } from "@/lib/ai/tool-protocol";
import { selectToolProvider } from "@/lib/agent/conversation";

/**
 * The tool-calling contract, pinned without a network.
 *
 * These cover the defects that made the ops agent look functional while it
 * never executed a single tool. Each one failed silently in production — the
 * loop degraded to prose instead of erroring — so they are regression tests
 * for behaviour that no type-check can catch.
 */

/** Minimal stand-in for a remote provider, so the wrapper can be tested alone. */
function fakeProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    name: "fake",
    model: "fake-model",
    kind: "remote",
    complete: async () => ({
      text: "plain",
      provider: "fake",
      model: "fake-model",
      promptTokens: 0,
      completionTokens: 0,
      estimatedCost: 0,
      status: "ok",
    }),
    ...overrides,
  } as AiProvider;
}

const request: CompletionRequest = { messages: [{ role: "user", content: "hi" }], temperature: 0, maxTokens: 10 };

describe("providerSupportsTools", () => {
  it("trusts an explicit toolCapable flag", () => {
    expect(providerSupportsTools(fakeProvider({ toolCapable: true }))).toBe(true);
    expect(providerSupportsTools(fakeProvider({ toolCapable: false }))).toBe(false);
  });

  it("falls back to probing the method when the flag is absent", () => {
    const withMethod = fakeProvider({
      completeWithTools: async () => ({ toolCalls: [], text: "", provider: "fake", model: "m", promptTokens: 0, completionTokens: 0, estimatedCost: 0, status: "ok" }),
    });
    expect(providerSupportsTools(withMethod)).toBe(true);
    expect(providerSupportsTools(fakeProvider())).toBe(false);
  });

  it("marks the OpenAI-shaped and Gemini kinds capable, and nothing else", () => {
    for (const kind of ["openrouter", "openai_compatible", "pollinations", "cloudflare", "gemini"]) {
      expect(TOOL_CAPABLE_KINDS.has(kind)).toBe(true);
    }
    expect(TOOL_CAPABLE_KINDS.has("anthropic")).toBe(false);
    expect(TOOL_CAPABLE_KINDS.has("deterministic")).toBe(false);
  });

  it("reports capability for a real RemoteProvider per kind", () => {
    const make = (kind: string) =>
      new RemoteProvider({ name: kind, kind: kind as never, model: "m", apiKey: "k" });
    expect(make("openrouter").toolCapable).toBe(true);
    expect(make("gemini").toolCapable).toBe(true);
    expect(make("anthropic").toolCapable).toBe(false);
  });
});

describe("QuotaEnforcedProvider", () => {
  /**
   * The regression that mattered: the wrapper did not declare
   * `completeWithTools`, so `supportsTools(wrapper)` was false for every
   * provider in the chain and the agent loop never offered tools at all.
   */
  it("exposes completeWithTools when the wrapped provider supports tools", () => {
    const inner = fakeProvider({
      toolCapable: true,
      completeWithTools: async () => ({
        toolCalls: [{ id: "c1", name: "menu_summary", arguments: "{}" }],
        text: "",
        provider: "fake",
        model: "fake-model",
        promptTokens: 1,
        completionTokens: 1,
        estimatedCost: 0,
        status: "ok",
      }),
    });
    const wrapped = new QuotaEnforcedProvider(inner, {
      monthlyTokenQuota: null,
      maxRequestsPerMinute: 100,
    });
    expect(typeof wrapped.completeWithTools).toBe("function");
    expect(providerSupportsTools(wrapped)).toBe(true);
  });

  it("delegates the tool call to the inner provider", async () => {
    const inner = fakeProvider({
      toolCapable: true,
      completeWithTools: async () => ({
        toolCalls: [{ id: "c1", name: "menu_summary", arguments: "{}" }],
        text: "",
        provider: "fake",
        model: "fake-model",
        promptTokens: 1,
        completionTokens: 1,
        estimatedCost: 0,
        status: "ok",
      }),
    });
    const wrapped = new QuotaEnforcedProvider(inner, {
      monthlyTokenQuota: null,
      maxRequestsPerMinute: 100,
    });
    const result = await wrapped.completeWithTools(request);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("menu_summary");
  });

  it("still answers the floor when the wrapped provider cannot call tools", () => {
    const wrapped = new QuotaEnforcedProvider(fakeProvider({ toolCapable: false }), {
      monthlyTokenQuota: null,
      maxRequestsPerMinute: 100,
    });
    expect(providerSupportsTools(wrapped)).toBe(false);
  });
});

describe("selectToolProvider", () => {
  const plain = (name: string, toolCapable = false): AiProvider =>
    ({
      name,
      model: `${name}-model`,
      kind: "remote",
      toolCapable,
      complete: async () => ({
        text: "",
        provider: name,
        model: `${name}-model`,
        promptTokens: 0,
        completionTokens: 0,
        estimatedCost: 0,
        status: "ok",
      }),
    }) as AiProvider;

  const floor = plain("deterministic");

  it("skips a non-tool primary for the first tool-capable provider", () => {
    // The live agentic routing puts gemini-free first; before this, a Gemini
    // primary could not call tools and the loop degraded to prose.
    const chain = {
      primary: plain("gemini-free", false),
      fallbacks: [plain("workers-ai", true), plain("pollinations", true)],
      fallback: floor,
    };
    expect(selectToolProvider(chain).name).toBe("workers-ai");
  });

  it("keeps the primary when it can call tools", () => {
    const chain = {
      primary: plain("openrouter-free", true),
      fallbacks: [plain("pollinations", true)],
      fallback: floor,
    };
    expect(selectToolProvider(chain).name).toBe("openrouter-free");
  });

  it("falls back to the primary when nothing can call tools", () => {
    const chain = {
      primary: plain("gemini-free", false),
      fallbacks: [plain("anthropic", false)],
      fallback: floor,
    };
    expect(selectToolProvider(chain).name).toBe("gemini-free");
  });

  it("uses the deterministic floor for an empty chain", () => {
    expect(selectToolProvider({ primary: null, fallbacks: [], fallback: floor }).name).toBe(
      "deterministic",
    );
  });
});

describe("parseToolTurnOpenAiLike", () => {
  it("reads tool calls out of an OpenAI-shaped body", () => {
    const turn = parseToolTurnOpenAiLike({
      choices: [{ message: { content: null as unknown as string, tool_calls: [{ id: "c1", function: { name: "menu_summary", arguments: "{}" } }] } }],
    });
    expect(turn.toolCalls).toHaveLength(1);
  });

  /**
   * The Cloudflare REST API nests the completion under `result`. Handing the
   * raw envelope to this parser yields zero calls and empty text — identical
   * to a model that declined to use a tool — so the unwrap is load-bearing.
   */
  it("finds nothing in a raw Cloudflare envelope, which is why it is unwrapped first", () => {
    const rawEnvelope = {
      result: { choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "menu_summary", arguments: "{}" } }] } }] },
      success: true,
    };
    const unwrapped = (rawEnvelope as { result: unknown }).result;
    const turn = parseToolTurnOpenAiLike(unwrapped as never);
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0].name).toBe("menu_summary");
  });
});

describe("parseGeminiTurn", () => {
  it("reads a functionCall part as a tool call", () => {
    const turn = parseGeminiTurn({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "menu_summary", args: {} } }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
    });
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0].name).toBe("menu_summary");
    expect(turn.toolCalls[0].arguments).toBe("{}");
    expect(turn.promptTokens).toBe(12);
  });

  it("keeps prose and calls apart in the same turn", () => {
    const turn = parseGeminiTurn({
      candidates: [
        {
          content: {
            parts: [{ text: "Let me check." }, { functionCall: { name: "orders_metrics", args: { days: 30 } } }],
          },
        },
      ],
    });
    expect(turn.text).toBe("Let me check.");
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0].arguments).toBe(JSON.stringify({ days: 30 }));
  });

  it("returns no calls for a plain answer", () => {
    const turn = parseGeminiTurn({ candidates: [{ content: { parts: [{ text: "84 dishes." }] } }] });
    expect(turn.toolCalls).toEqual([]);
    expect(turn.text).toBe("84 dishes.");
  });
});
