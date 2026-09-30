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

describe("finaliseAnswer — a claimed document must exist", () => {
  const noDocSteps: AgentStep[] = [
    { tool: "orders_metrics", arguments: {}, status: "ok", summary: "metrics", data: { orders: 3 } },
  ];

  it("withholds a document claim when create_document never ran", () => {
    // Reproduced live: the model said the deck was in Deliverables while it had
    // never called create_document, so the operator looked for a missing file.
    const answer = finaliseAnswer(
      "جهزت لك عرض تقديمي وهو موجود في قسم المستندات دلوقتي.",
      noDocSteps,
      [{ orders: 3 }],
      null,
    );
    expect(answer).not.toContain("قسم المستندات");
    expect(answer).toContain("مفيش ملف");
  });

  it("withholds the English phrasing too", () => {
    const answer = finaliseAnswer(
      "Your slide deck is saved under AI ops → Deliverables.",
      noDocSteps,
      [{ orders: 3 }],
      null,
    );
    expect(answer).not.toContain("Deliverables");
  });

  it("allows the claim when create_document succeeded", () => {
    const withDoc: AgentStep[] = [
      ...noDocSteps,
      {
        tool: "create_document",
        arguments: { kind: "slide_deck" },
        status: "ok",
        summary: "slide_deck saved",
        data: { title: "حالتنا" },
      },
    ];
    const answer = finaliseAnswer(
      "جهزت لك عرض تقديمي وهو موجود في قسم المستندات.",
      withDoc,
      [{ orders: 3 }],
      null,
    );
    expect(answer).toContain("قسم المستندات");
  });

  it("allows the claim when create_document is pending approval, not ok", () => {
    // A pending write is not a saved file, so the same guard must still fire.
    const pending: AgentStep[] = [
      ...noDocSteps,
      {
        tool: "create_document",
        arguments: { kind: "slide_deck" },
        status: "pending_approval",
        summary: "waiting",
        data: null,
      },
    ];
    const answer = finaliseAnswer("العرض جاهز في المستندات.", pending, [{ orders: 3 }], null);
    expect(answer).not.toContain("العرض جاهز");
  });

  it("does not mistake an offer or a statement of absence for a claim", () => {
    // Present tense ("أقدر أعملك") and negation ("مفيش") are not completions.
    const offer = finaliseAnswer("أقدر أعملك تقرير مفصل لو تحب.", noDocSteps, [{ orders: 3 }], null);
    expect(offer).toBe("أقدر أعملك تقرير مفصل لو تحب.");

    const absent = finaliseAnswer("مفيش تقرير محفوظ للفترة دي.", noDocSteps, [{ orders: 3 }], null);
    expect(absent).toBe("مفيش تقرير محفوظ للفترة دي.");
  });

  it("does not touch ordinary prose that never mentions documents", () => {
    const answer = finaliseAnswer("عندنا 3 أوردرات.", noDocSteps, [{ orders: 3 }], null);
    expect(answer).toBe("عندنا 3 أوردرات.");
  });
});

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
