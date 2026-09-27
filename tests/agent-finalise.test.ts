import { describe, expect, it, vi } from "vitest";
import type { AgentStep } from "@/lib/agent/conversation";
import { FABRICATION_NOTICE } from "@/lib/agent/grounding";

// The real module pulls in every server dependency (Supabase, provider chain).
// `finaliseAnswer` is pure, so it is re-imported in isolation with the heavy
// imports stubbed out — the test exercises the actual guard, not a copy.
vi.mock("@/lib/supabase/server", () => ({ tryCreateAdminSupabase: () => null }));
vi.mock("@/lib/services/catalog", () => ({
  getPublicMenu: async () => ({ categories: [], items: [] }),
  getPublicSettings: async () => ({}),
  getRestaurant: async () => null,
  getEnabledRewards: async () => [],
}));
vi.mock("@/lib/crm/insights", () => ({ getDashboardMetrics: async () => ({}) }));

const { finaliseAnswer } = await import("@/lib/agent/conversation");

const steps: AgentStep[] = [
  { tool: "orders_metrics", arguments: {}, status: "ok", summary: "30-day metrics", data: { revenueInWindow: 0 } },
];

describe("finaliseAnswer — the anti-hallucination gate", () => {
  it("passes through an answer whose numbers the tools returned", () => {
    const answer = finaliseAnswer("الإيراد 0 ج.م.", steps, [{ revenueInWindow: 0 }], null);
    expect(answer).toBe("الإيراد 0 ج.م.");
  });

  it("withholds an answer citing a figure no tool returned, keeping the honest summary", () => {
    const answer = finaliseAnswer("إيراد النهاردة 4800 ج.م.", steps, [{ revenueInWindow: 0 }], null);
    expect(answer).toContain(FABRICATION_NOTICE);
    expect(answer).not.toContain("4800");
    // The raw observation is still shown, so staff see the real number.
    expect(answer).toContain("orders_metrics");
  });

  it("falls back to the tool summary when the model produced no text", () => {
    const answer = finaliseAnswer("", steps, [{ revenueInWindow: 0 }], null);
    expect(answer).toContain("orders_metrics");
  });

  it("says the model was unreachable instead of implying there was no data", () => {
    const answer = finaliseAnswer("", steps, [], "socket hang up");
    expect(answer).toMatch(/مش قادر أوصل/);
  });
});
