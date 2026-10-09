import { describe, expect, it } from "vitest";
import { AI_TASKS, routePriority, type DbProviderRow } from "@/lib/ai/provider";

/**
 * The routing contract, pinned without a network or a database.
 *
 * `buildDbProviderChain` sorts by `routePriority(row, task)`, so the ordering
 * rule is the whole feature. These tests lock the three cases that matter:
 * a task keyed in `routes` uses the map value, a task absent falls back to the
 * base `priority`, and a missing/garbage map is treated as empty rather than
 * crashing the chain.
 */
function row(partial: Partial<DbProviderRow> & { name: string }): DbProviderRow {
  return {
    kind: "openai_compatible",
    model: null,
    base_url: null,
    secret_ref: null,
    is_enabled: true,
    is_fallback: false,
    priority: 100,
    monthly_token_quota: null,
    max_requests_per_minute: 20,
    ...partial,
  };
}

describe("routePriority", () => {
  it("uses the routes map value when the task is keyed", () => {
    const r = row({ name: "gemini", priority: 40, routes: { agentic: 10 } });
    expect(routePriority(r, "agentic")).toBe(10);
  });

  it("falls back to the base priority for a task absent from the map", () => {
    const r = row({ name: "gemini", priority: 40, routes: { agentic: 10 } });
    expect(routePriority(r, "chat")).toBe(40);
    expect(routePriority(r, "ops")).toBe(40);
  });

  it("treats an empty or missing map as the base priority for every task", () => {
    const empty = row({ name: "pollinations", priority: 20, routes: {} });
    const missing = row({ name: "pollinations", priority: 20, routes: null });
    for (const task of AI_TASKS) {
      expect(routePriority(empty, task)).toBe(20);
      expect(routePriority(missing, task)).toBe(20);
    }
  });

  it("ignores a non-numeric route value instead of coercing it to NaN", () => {
    // The column is jsonb, so a hand-edited row can hold anything.
    const r = row({ name: "odd", priority: 55, routes: { chat: 5, ops: 7 } });
    expect(routePriority(r, "chat")).toBe(5);
    // A missing numeric for `agentic` falls back rather than yielding NaN.
    expect(routePriority(r, "agentic")).toBe(55);
  });

  it("produces the owner's intended order per task", () => {
    const rows: DbProviderRow[] = [
      row({ name: "workers-ai", priority: 10, routes: { ops: 10, chat: 20, agentic: 40 } }),
      row({ name: "gemini-free", priority: 40, routes: { agentic: 10, ops: 30, chat: 40 } }),
      row({ name: "openrouter-free", priority: 30, routes: { chat: 10, agentic: 20, ops: 30 } }),
      row({ name: "pollinations", priority: 20, routes: {} }),
    ];
    const order = (task: (typeof AI_TASKS)[number]) =>
      [...rows].sort((a, b) => routePriority(a, task) - routePriority(b, task)).map((r) => r.name);

    // Agentic hard work -> the strong free Gemini model first.
    expect(order("agentic")[0]).toBe("gemini-free");
    // Daily ops reports -> the keyless Workers AI binding first.
    expect(order("ops")[0]).toBe("workers-ai");
    // Chat -> OpenRouter first when its key is present.
    expect(order("chat")[0]).toBe("openrouter-free");
  });
});
