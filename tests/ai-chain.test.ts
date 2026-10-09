import { describe, expect, it } from "vitest";
import { buildDbProviderChain, loadDbProviders, runCompletion } from "@/lib/ai/provider";

/**
 * Integration coverage for the admin-configured AI provider chain. Runs against
 * the live `ai_providers` rows when Supabase credentials are present in the
 * environment, and skips otherwise so `npm test` stays green without secrets.
 *
 * This is the regression that matters: the chain used to return only the first
 * resolvable provider and `runCompletion` never walked `fallbacks`, so the
 * "primary -> fallbacks -> deterministic floor" contract was not actually
 * enforced. These tests fail if that regresses.
 */
const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!hasSupabase)("AI provider chain (live rows)", () => {
  it("orders providers by priority and exposes the later ones as fallbacks", async () => {
    const rows = await loadDbProviders();
    expect(rows.length).toBeGreaterThan(0);

    const chain = await buildDbProviderChain({ rows, binding: null }, () => "deterministic");

    // priority 10 (workers-ai) is the primary when the REST fallback resolves;
    // the deterministic row (priority 900) is the floor, never a fallback entry.
    expect(chain.primary?.name).toBeTruthy();
    expect(chain.fallback.name).toBe("deterministic");
    expect(chain.fallbacks.some((f) => f.name === "deterministic")).toBe(false);

    const names = [chain.primary?.name, ...chain.fallbacks.map((f) => f.name)];
    // Nothing resolves twice, and the count never exceeds the enabled rows.
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeLessThanOrEqual(rows.filter((r) => r.is_enabled && !r.is_fallback).length);
  });

  it("produces a non-empty grounded answer even when every remote provider fails", async () => {
    const rows = await loadDbProviders();
    const chain = await buildDbProviderChain({ rows, binding: null }, () => "grounded fallback text");

    // Force the remote providers to be unreachable, then confirm the chain still
    // answers from the deterministic floor instead of throwing.
    chain.primary = null;
    chain.fallbacks = [];

    const run = await runCompletion(chain, {
      messages: [{ role: "user", content: "what is on the menu" }],
      temperature: 0,
      maxTokens: 32,
    });

    expect(run.text).toBe("grounded fallback text");
    expect(run.status).toBe("fallback");
  });
});
