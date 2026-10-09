import { describe, expect, it } from "vitest";
import { buildDbProviderChain, loadDbProviders, runCompletion } from "@/lib/ai/provider";

/**
 * Live smoke test: walks the real provider chain built from the admin's
 * `ai_providers` rows and asserts a real model answers. Keys are read from
 * Supabase Vault, so this proves the whole path (row -> secret_ref -> Vault ->
 * HTTP provider) rather than just the wiring.
 *
 * Opt-in via AI_LIVE=1 because it costs a live API call and needs network.
 */
const enabled = process.env.AI_LIVE === "1";

describe.skipIf(!enabled)("AI providers (live network)", () => {
  it("answers a menu question from the configured chain", async () => {
    const rows = await loadDbProviders();
    const chain = await buildDbProviderChain({ rows, binding: null }, () => "deterministic");

    console.log(
      "chain:",
      [chain.primary?.name, ...chain.fallbacks.map((f) => f.name), `floor:${chain.fallback.name}`]
        .filter(Boolean)
        .join(" -> "),
    );

    const run = await runCompletion(chain, {
      messages: [
        { role: "system", content: "Answer in one short sentence." },
        { role: "user", content: "Name one dish on the menu." },
      ],
      temperature: 0,
      maxTokens: 60,
    });

    console.log("answered by:", run.provider, "| model:", run.model, "| status:", run.status);
    console.log("text:", run.text.slice(0, 160));
    console.log("error trace:", run.error);

    expect(run.text.length).toBeGreaterThan(0);
    expect(run.status).toBe("ok");
  }, 60_000);

  it("falls through to the next provider when the primary fails", async () => {
    const rows = await loadDbProviders();
    const chain = await buildDbProviderChain({ rows, binding: null }, () => "deterministic");

    // Drop the primary and confirm a *different* provider still answers, i.e.
    // `fallbacks` is genuinely walked rather than ignored.
    const dropped = chain.primary?.name;
    chain.primary = null;
    expect(chain.fallbacks.length).toBeGreaterThan(0);

    const run = await runCompletion(chain, {
      messages: [{ role: "user", content: "Name one dish on the menu." }],
      temperature: 0,
      maxTokens: 60,
    });

    console.log("primary dropped:", dropped, "-> answered by:", run.provider, "| status:", run.status);
    expect(run.status).toBe("ok");
    expect(run.provider).not.toBe(dropped);
  }, 60_000);
});
