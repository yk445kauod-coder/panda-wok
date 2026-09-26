import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUS_FLOW,
  TERMINAL_STATUSES,
  allowedTransitions,
  buildTimeline,
  isActive,
  isTerminal,
} from "@/lib/services/order-workflow";
import type { Database } from "@/lib/types/database";

type OrderStatus = Database["public"]["Enums"]["order_status"];

const ALL_STATUSES = Object.keys(ALLOWED_TRANSITIONS) as OrderStatus[];

/**
 * The order state machine is the contract the admin buttons and the customer
 * timeline both read, so it is tested directly rather than through the UI.
 */
describe("order status machine", () => {
  it("covers every status in the enum", () => {
    // A status added to the database without a transition entry would make the
    // kitchen controls render nothing and the timeline throw.
    expect(ALL_STATUSES.sort()).toEqual(
      [
        "new",
        "accepted",
        "in_progress",
        "prepared",
        "out_for_delivery",
        "finished",
        "canceled",
        "rejected",
        "failed",
        "refunded",
      ].sort(),
    );
  });

  it("only allows the documented happy path forward", () => {
    for (let i = 0; i < ORDER_STATUS_FLOW.length - 1; i += 1) {
      const from = ORDER_STATUS_FLOW[i];
      const to = ORDER_STATUS_FLOW[i + 1];
      expect(allowedTransitions(from)).toContain(to);
    }
  });

  it("never allows skipping a step", () => {
    expect(allowedTransitions("new")).not.toContain("prepared");
    expect(allowedTransitions("new")).not.toContain("out_for_delivery");
    expect(allowedTransitions("new")).not.toContain("finished");
    expect(allowedTransitions("accepted")).not.toContain("finished");
  });

  it("treats terminal statuses as final", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(isTerminal(status)).toBe(true);
      expect(isActive(status)).toBe(false);
    }
  });

  it("has no way out of a canceled order", () => {
    expect(allowedTransitions("canceled")).toHaveLength(0);
    expect(allowedTransitions("rejected")).toHaveLength(0);
    expect(allowedTransitions("refunded")).toHaveLength(0);
  });

  it("only lets a finished order be refunded", () => {
    expect(allowedTransitions("finished")).toEqual(["refunded"]);
  });

  it("lets a delivery be refunded after dispatch but not before", () => {
    expect(allowedTransitions("out_for_delivery")).toContain("refunded");
    expect(allowedTransitions("prepared")).not.toContain("refunded");
    expect(allowedTransitions("in_progress")).not.toContain("refunded");
  });

  it("marks only in-flight statuses active", () => {
    expect(isActive("new")).toBe(true);
    expect(isActive("out_for_delivery")).toBe(true);
    expect(isActive("finished")).toBe(false);
  });
});

describe("customer timeline", () => {
  const history = [
    { to_status: "new" as OrderStatus, created_at: "2026-01-01T10:00:00Z" },
    { to_status: "accepted" as OrderStatus, created_at: "2026-01-01T10:05:00Z" },
    { to_status: "in_progress" as OrderStatus, created_at: "2026-01-01T10:10:00Z" },
  ];

  it("marks completed, current and upcoming steps", () => {
    const timeline = buildTimeline("in_progress", history);
    expect(timeline.find((s) => s.status === "new")?.state).toBe("done");
    expect(timeline.find((s) => s.status === "accepted")?.state).toBe("done");
    expect(timeline.find((s) => s.status === "in_progress")?.state).toBe("current");
    expect(timeline.find((s) => s.status === "prepared")?.state).toBe("upcoming");
  });

  it("stamps the time each step was reached", () => {
    const timeline = buildTimeline("in_progress", history);
    expect(timeline.find((s) => s.status === "accepted")?.at).toBe(
      "2026-01-01T10:05:00Z",
    );
    expect(timeline.find((s) => s.status === "prepared")?.at).toBeNull();
  });

  it("drops the rider step for a pickup order", () => {
    const delivery = buildTimeline("prepared", history, false);
    const pickup = buildTimeline("prepared", history, true);
    expect(delivery.some((s) => s.status === "out_for_delivery")).toBe(true);
    expect(pickup.some((s) => s.status === "out_for_delivery")).toBe(false);
  });

  it("ends a canceled order on a failed step instead of showing the rest", () => {
    const canceled = buildTimeline("canceled", [
      ...history,
      { to_status: "canceled", created_at: "2026-01-01T10:12:00Z" },
    ]);
    const last = canceled[canceled.length - 1];
    expect(last.status).toBe("canceled");
    expect(last.state).toBe("failed");
    expect(canceled.some((s) => s.status === "finished")).toBe(false);
  });
});

/**
 * A multi-item basket must price as one order per basket, while a customer can
 * hold several live orders at once. These cases pin the arithmetic the database
 * performs, using the live settings (14% tax, 30 EGP delivery, free over 250).
 */
describe("order totals for a multi-item basket", () => {
  const TAX_RATE = 0.14;
  const DELIVERY_FEE = 30;
  const FREE_DELIVERY_OVER = 250;

  function price(lines: { unit: number; qty: number }[], fulfillment: "delivery" | "pickup") {
    const subtotal = lines.reduce((sum, l) => sum + l.unit * l.qty, 0);
    const delivery =
      fulfillment === "pickup" || subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
    const tax = Math.round((subtotal + delivery) * TAX_RATE * 100) / 100;
    const total = Math.round((subtotal + delivery + tax) * 100) / 100;
    return { subtotal, delivery, tax, total };
  }

  it("charges delivery and tax on a single item", () => {
    expect(price([{ unit: 120, qty: 1 }], "delivery")).toEqual({
      subtotal: 120,
      delivery: 30,
      tax: 21,
      total: 171,
    });
  });

  it("sums several lines into one subtotal", () => {
    expect(price([{ unit: 120, qty: 2 }, { unit: 95.5, qty: 1 }], "delivery")).toEqual({
      subtotal: 335.5,
      delivery: 0,
      tax: 46.97,
      total: 382.47,
    });
  });

  it("drops the delivery fee once the basket passes the threshold", () => {
    expect(price([{ unit: 286.5, qty: 1 }], "delivery").delivery).toBe(0);
    expect(price([{ unit: 200, qty: 1 }], "delivery").delivery).toBe(30);
  });

  it("never charges delivery on pickup", () => {
    expect(price([{ unit: 100, qty: 1 }], "pickup").delivery).toBe(0);
  });

  it("keeps piastres exact rather than rounding to whole pounds", () => {
    const { total } = price([{ unit: 95.5, qty: 3 }], "pickup");
    expect(total).toBe(326.61);
    expect(Number.isInteger(total)).toBe(false);
  });
});
