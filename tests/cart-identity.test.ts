import { describe, expect, it } from "vitest";
import { cartLineKey } from "@/components/customer/cart-provider";

describe("cart line identity", () => {
  it("keeps different piece-count options as separate lines", () => {
    expect(
      cartLineKey("roll-1", [{ id: "pieces-4", name: "4 Pieces", priceDelta: 0 }]),
    ).not.toBe(
      cartLineKey("roll-1", [{ id: "pieces-8", name: "8 Pieces", priceDelta: 195 }]),
    );
  });

  it("is stable when modifier options arrive in a different order", () => {
    const first = [
      { id: "sauce", name: "Sauce", priceDelta: 10 },
      { id: "pieces-8", name: "8 Pieces", priceDelta: 195 },
    ];
    const second = [...first].reverse();
    expect(cartLineKey("roll-1", first)).toBe(cartLineKey("roll-1", second));
  });
});
