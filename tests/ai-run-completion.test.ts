import { describe, expect, it } from "vitest";
import { runCompletion, type ProviderChain, type AiProvider } from "@/lib/ai/provider";

/**
 * The chain's outcome semantics, pinned without a network.
 *
 * The regression this locks: a primary that fails (e.g. an OpenRouter reasoning
 * model that spent its whole budget on hidden reasoning and returned
 * `content: null`) used to brand the *successful* fallback answer as an error —
 * `ai_requests` logged `error: "Provider <primary> returned an empty
 * completion"` even though workers-ai had answered. A fallback that answers is
 * the chain working as designed; `error` must be null, and the tripped providers
 * travel in `providerErrors` for the ledger instead.
 */
function provider(name: string, behavior: "ok" | "fail"): AiProvider {
  return {
    name,
    model: `${name}-model`,
    kind: "remote",
    toolCapable: true,
    async complete() {
      if (behavior === "fail") throw new Error(`Provider ${name} returned an empty completion`);
      return {
        text: `answer from ${name}`,
        provider: name,
        model: `${name}-model`,
        promptTokens: 10,
        completionTokens: 20,
        estimatedCost: 0,
        status: "ok" as const,
      };
    },
  };
}

function chain(primary: AiProvider, fallbacks: AiProvider[]): ProviderChain {
  return {
    primary,
    fallbacks,
    fallback: {
      name: "deterministic",
      model: "floor",
      kind: "builtin",
      async complete() {
        return {
          text: "deterministic answer",
          provider: "deterministic",
          model: "floor",
          promptTokens: 0,
          completionTokens: 0,
          estimatedCost: 0,
          status: "fallback" as const,
        };
      },
    },
  };
}

describe("runCompletion outcome semantics", () => {
  it("answers ok with no error when a fallback recovers after the primary failed", async () => {
    const run = await runCompletion(
      chain(provider("openrouter-free", "fail"), [provider("workers-ai", "ok")]),
      { messages: [], temperature: 0.2, maxTokens: 900 },
    );

    expect(run.status).toBe("ok");
    expect(run.provider).toBe("workers-ai");
    expect(run.error).toBeNull();
    // The failure is still observable, just not branded as an error.
    expect(run.providerErrors).toContain("Provider openrouter-free returned an empty completion");
  });

  it("answers ok with no errors when the primary answers first", async () => {
    const run = await runCompletion(
      chain(provider("workers-ai", "ok"), [provider("openrouter-free", "fail")]),
      { messages: [], temperature: 0.2, maxTokens: 900 },
    );

    expect(run.status).toBe("ok");
    expect(run.provider).toBe("workers-ai");
    expect(run.error).toBeNull();
    expect(run.providerErrors).toEqual([]);
  });

  it("reports an error when every provider fails and the floor must answer", async () => {
    const run = await runCompletion(
      chain(provider("openrouter-free", "fail"), [provider("workers-ai", "fail")]),
      { messages: [], temperature: 0.2, maxTokens: 900 },
    );

    expect(run.status).toBe("fallback");
    expect(run.provider).toBe("deterministic");
    expect(run.error).toContain("openrouter-free");
    expect(run.error).toContain("workers-ai");
    expect(run.providerErrors.length).toBe(2);
  });
});