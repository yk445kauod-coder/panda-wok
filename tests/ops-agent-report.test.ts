import { describe, expect, it } from "vitest";
import { buildMemoryDigest, pickGroundedReport } from "@/lib/agent/ops-agent";
import {
  buildDeterministicInsights,
  type DashboardMetrics,
  type InsightData,
} from "@/lib/crm/insights";

/**
 * Regression cover for two defects found in the live ops-agent output.
 *
 * 1. A run reported provider "workers-ai" with Arabic actions stored, yet its
 *    headline and summary were the deterministic English strings — the model's
 *    prose was parsed and thrown away.
 * 2. The category-concentration finding printed "about 19000% of finished
 *    revenue" because the numerator summed every non-cancelled order while the
 *    denominator counted only finished ones, with a `Math.max(..., 1)` floor
 *    standing in for a zero base.
 */

const fallback = {
  headline: "Not enough order history for reliable patterns yet",
  summary: "Only 2 non-cancelled orders were recorded in the last 30 days.",
  recommendations: [{ title: "Seed", detail: "seed detail", severity: "low" }],
};

const snapshot = { windowDays: 30, metrics: { revenueInWindow: 190, ordersInWindow: 2 } };

describe("pickGroundedReport — accept model prose only when its numbers are real", () => {
  it("uses the model's Arabic headline, summary and findings when every figure is grounded", () => {
    const parsed = {
      headline: "الإيراد ضعيف الأسبوعين اللي فاتوا",
      summary: "عندنا 190 جنيه من 2 أوردر في 30 يوم.",
      recommendations: [
        { title: "قلة الأوردرات", detail: "190 جنيه بس من 2 أوردر.", severity: "high" },
      ],
    };
    const picked = pickGroundedReport({
      parsed,
      rawText: JSON.stringify(parsed),
      snapshot,
      fallback,
    });

    expect(picked.grounded).toBe(true);
    expect(picked.headline).toBe("الإيراد ضعيف الأسبوعين اللي فاتوا");
    expect(picked.summary).toContain("190");
    expect(picked.recommendations[0]?.title).toBe("قلة الأوردرات");
  });

  it("rejects a reply citing a figure the snapshot does not contain", () => {
    const parsed = {
      headline: "شغل تمام",
      summary: "إيراد النهاردة 4800 جنيه.",
      recommendations: [],
    };
    const picked = pickGroundedReport({
      parsed,
      rawText: JSON.stringify(parsed),
      snapshot,
      fallback,
    });

    expect(picked.grounded).toBe(false);
    // The deterministic wording survives, and the invented figure never lands.
    expect(picked.headline).toBe(fallback.headline);
    expect(picked.summary).toBe(fallback.summary);
    expect(picked.summary).not.toContain("4800");
  });

  it("keeps the fallback findings when the model returns none", () => {
    const parsed = { headline: "ملخص", summary: "الإيراد 190 جنيه.", recommendations: [] };
    const picked = pickGroundedReport({
      parsed,
      rawText: JSON.stringify(parsed),
      snapshot,
      fallback,
    });

    expect(picked.grounded).toBe(true);
    expect(picked.headline).toBe("ملخص");
    expect(picked.recommendations).toEqual(fallback.recommendations);
  });

  it("drops malformed findings rather than storing unusable rows", () => {
    const parsed = {
      headline: "ملخص",
      summary: "الإيراد 190 جنيه.",
      recommendations: [{ detail: "no title", severity: "high" }, { title: "   " }],
    };
    const picked = pickGroundedReport({
      parsed,
      rawText: JSON.stringify(parsed),
      snapshot,
      fallback,
    });

    expect(picked.recommendations).toEqual(fallback.recommendations);
  });

  it("normalises an unknown severity to low", () => {
    const parsed = {
      headline: "ملخص",
      summary: "الإيراد 190 جنيه.",
      recommendations: [{ title: "بند", detail: "تفصيل", severity: "catastrophic" }],
    };
    const picked = pickGroundedReport({ parsed, rawText: JSON.stringify(parsed), snapshot, fallback });

    expect(picked.recommendations[0]?.severity).toBe("low");
  });
});

describe("category concentration — the share must not exceed 100%", () => {
  function dataWith(categoryMix: InsightData["categoryMix"], finishedRevenue: number): InsightData {
    return {
      windowDays: 30,
      totals: { orders: 2, revenue: finishedRevenue, avgOrderValue: 0, canceled: 2 },
      pairs: [],
      topItems: [],
      weakItems: [],
      itemTrend: [],
      inactiveCustomers: { count: 0, avgDaysSinceOrder: null },
      loyalty: { members: 0, pointsOutstanding: 0, lapsedMembers: 0 },
      feedback: { count: 0, averageRating: 0, negativeThemes: [] },
      stockDemand: [],
      categoryMix,
    };
  }

  it("reports a sane share when finished revenue is zero but item revenue is not", () => {
    const findings = buildDeterministicInsights(
      dataWith([{ category: "Appetizers", quantity: 2, revenue: 190 }], 0),
    );
    const concentration = findings.find((f) => f.title.startsWith("Category concentration"));

    expect(concentration).toBeDefined();
    expect(concentration?.observation).toContain("100%");
    expect(concentration?.observation).not.toContain("19000");
  });

  it("splits the share across categories rather than exceeding the total", () => {
    const findings = buildDeterministicInsights(
      dataWith(
        [
          { category: "Sushi", quantity: 3, revenue: 300 },
          { category: "Wok", quantity: 3, revenue: 300 },
        ],
        600,
      ),
    );
    const concentration = findings.find((f) => f.title.startsWith("Category concentration"));

    expect(concentration?.observation).toContain("50%");
  });

  it("guards a zero-revenue mix instead of dividing by a fake denominator", () => {
    const findings = buildDeterministicInsights(
      dataWith([{ category: "Sushi", quantity: 0, revenue: 0 }], 0),
    );
    const concentration = findings.find((f) => f.title.startsWith("Category concentration"));

    expect(concentration?.observation).toContain("0%");
  });
});

describe("buildMemoryDigest — one retrievable fact, not a report dump", () => {
  const metrics = {
    windowDays: 30,
    ordersToday: 0,
    ordersInWindow: 4,
    revenueInWindow: 405.5,
    avgOrderValue: 101.38,
    newCustomers: 2,
    returningCustomers: 1,
    canceledOrders: 2,
    cashCollected: 0,
    statusBreakdown: [],
    revenueByDay: [],
    topItems: [
      { name: "combo fried 8 pieces", quantity: 2, revenue: 680 },
      { name: "Philadelphia Roll", quantity: 1, revenue: 215 },
    ],
    categoryMix: [],
    stockWarnings: [],
    feedbackSummary: { count: 1, averageRating: 5, distribution: [] },
  } as unknown as DashboardMetrics;

  it("carries the numbers a later run needs to compare", () => {
    const digest = buildMemoryDigest(metrics);
    expect(digest).toContain("4 طلب");
    expect(digest).toContain("405.50 EGP");
    expect(digest).toContain("101.38 EGP");
    expect(digest).toContain("2 عميل جديد");
    expect(digest).toContain("2 ملغي");
    expect(digest).toContain("combo fried 8 pieces");
  });

  it("never carries report prose, so a stale narrative cannot become a fact", () => {
    // The live defect: the row held the summary verbatim, including the
    // known-bad "about 19000%" share, and the agent recalled it as real.
    const digest = buildMemoryDigest(metrics);
    expect(digest).not.toContain("Not enough order history");
    expect(digest).not.toContain("19000");
    expect(digest).not.toContain("directional only");
  });

  it("stays small and bounded", () => {
    const digest = buildMemoryDigest(metrics);
    expect(digest.length).toBeLessThanOrEqual(500);
  });
});
