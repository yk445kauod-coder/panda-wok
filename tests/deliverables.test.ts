import { describe, it, expect } from "vitest";
import {
  classifyQuadrant,
  isDeliverableKind,
  renderDeliverableCatalogue,
} from "@/lib/agent/deliverables";

/**
 * The deliverables engine is mostly I/O, but two pieces of logic decide what a
 * filed document says and must not drift: which kinds are valid (a typo would
 * silently queue an unrenderable proposal) and which menu quadrant a dish lands
 * in (a boundary error would mislabel a star as a dog in an owner-facing report).
 */

describe("deliverable kinds", () => {
  const KINDS = [
    "daily_sales",
    "weekly_kpi",
    "menu_engineering",
    "stock_reorder",
    "winback_draft",
    "pricing_review",
    "eod_reconciliation",
  ];

  it("accepts every renderable kind", () => {
    for (const kind of KINDS) expect(isDeliverableKind(kind)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "custom", "report", "DAILY_SALES", "daily-sales"]) {
      expect(isDeliverableKind(bad)).toBe(false);
    }
  });

  it("catalogues every kind with a description", () => {
    const catalogue = renderDeliverableCatalogue();
    for (const kind of KINDS) expect(catalogue).toContain(kind);
  });
});

describe("classifyQuadrant", () => {
  it("classifies at or above both medians as a Star", () => {
    expect(classifyQuadrant(10, 500, 5, 250)).toBe("Star");
  });

  it("classifies popular but low contribution as a Plowhorse", () => {
    expect(classifyQuadrant(10, 100, 5, 250)).toBe("Plowhorse");
  });

  it("classifies high contribution but unpopular as a Puzzle", () => {
    expect(classifyQuadrant(2, 500, 5, 250)).toBe("Puzzle");
  });

  it("classifies below both medians as a Dog", () => {
    expect(classifyQuadrant(1, 10, 5, 250)).toBe("Dog");
  });

  it("treats a value exactly on the median as at-or-above", () => {
    expect(classifyQuadrant(5, 250, 5, 250)).toBe("Star");
    expect(classifyQuadrant(5, 100, 5, 250)).toBe("Plowhorse");
    expect(classifyQuadrant(1, 250, 5, 250)).toBe("Puzzle");
  });
});
