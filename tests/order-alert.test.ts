import { describe, expect, it } from "vitest";
import {
  arrivedIds,
  pendingSignature,
  shouldRing,
  unacknowledgedOrders,
  type OrderAlert,
} from "@/lib/sound/alert-state";

function order(id: string, orderNumber = id, createdAt = "2026-10-03T00:00:00Z"): OrderAlert {
  return { id, orderNumber, createdAt };
}

/**
 * The kitchen's rule: the order alarm rings loudly and does not stop until
 * somebody takes an action on the order. These pin the state machine behind
 * that — when it starts, and the three ways it stops.
 */
describe("order alert state", () => {
  it("rings while there is an unacknowledged new order", () => {
    expect(shouldRing(1, false)).toBe(true);
    expect(shouldRing(3, false)).toBe(true);
  });

  it("is silent with no new orders, or when the console is muted", () => {
    expect(shouldRing(0, false)).toBe(false);
    expect(shouldRing(2, true)).toBe(false);
  });

  it("stops once every new order is acknowledged", () => {
    const pending = [order("a"), order("b")];
    expect(unacknowledgedOrders(pending, new Set()).map((o) => o.id)).toEqual(["a", "b"]);
    expect(unacknowledgedOrders(pending, new Set(["a"])).map((o) => o.id)).toEqual(["b"]);
    expect(unacknowledgedOrders(pending, new Set(["a", "b"]))).toEqual([]);
  });

  it("ignores acknowledgements for orders that are no longer pending", () => {
    // An accepted order drops out of the server list; its stale ack must not
    // affect the orders that remain.
    const pending = [order("b")];
    expect(unacknowledgedOrders(pending, new Set(["a"])).map((o) => o.id)).toEqual(["b"]);
  });

  it("reports an order that was accepted as no longer ringing", () => {
    // Before: order `a` is new -> pending -> ringing. After: accepted, so the
    // server list is empty -> nothing to ring for. This is "stop when the
    // status changes away from new".
    expect(shouldRing(unacknowledgedOrders([order("a")], new Set()).length, false)).toBe(true);
    expect(shouldRing(unacknowledgedOrders([], new Set()).length, false)).toBe(false);
  });

  it("detects genuinely new arrivals and ignores ones already seen", () => {
    const seen = new Set(["a", "b"]);
    expect(arrivedIds(seen, ["a", "b", "c"])).toEqual(["c"]);
    expect(arrivedIds(seen, ["a", "b"])).toEqual([]);
  });

  it("builds an order-independent signature so a reshuffle is not a change", () => {
    expect(pendingSignature([order("b"), order("a")])).toBe("a,b");
    expect(pendingSignature([order("a"), order("b")])).toBe("a,b");
    expect(pendingSignature([])).toBe("");
  });
});
