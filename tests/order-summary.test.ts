import { describe, expect, it } from "vitest";
import { orderItemLine, summariseOrderItems } from "@/lib/services/admin-orders";

/**
 * The kitchen reads a ticket's `items_summary`, not the order row. Before this
 * was fixed the summary ignored `order_items.modifiers`, so "Chicken with sweet
 * & sour sauce" printed as a bare "1× Chicken" and the cook could not tell it
 * apart from a Chicken with any other sauce — the customer's choice, which is
 * priced and must be honoured, was dropped. These cases pin that the option
 * names are part of the line.
 */
describe("orderItemLine", () => {
  it("appends the chosen options to the dish", () => {
    expect(
      orderItemLine({
        id: "1",
        name_snapshot: "Chicken",
        quantity: 1,
        modifiers: [{ name: "sweet & sour sauce", price_delta: 0 }],
      }),
    ).toBe("1× Chicken (sweet & sour sauce)");
  });

  it("keeps a plain dish plain when nothing was chosen", () => {
    expect(orderItemLine({ id: "1", name_snapshot: "Cola", quantity: 2 })).toBe(
      "2× Cola",
    );
    expect(
      orderItemLine({ id: "1", name_snapshot: "Cola", quantity: 2, modifiers: [] }),
    ).toBe("2× Cola");
  });

  it("joins several options, e.g. protein plus size", () => {
    expect(
      orderItemLine({
        id: "1",
        name_snapshot: "Philadelphia Roll",
        quantity: 3,
        modifiers: [{ name: "8 Pieces" }, { name: "Shrimp" }],
      }),
    ).toBe("3× Philadelphia Roll (8 Pieces, Shrimp)");
  });

  it("reads the older name_en shape too", () => {
    expect(
      orderItemLine({
        id: "1",
        name_snapshot: "combo 8 pieces",
        quantity: 1,
        modifiers: [{ name_en: "Dynamite Roll" }],
      }),
    ).toBe("1× combo 8 pieces (Dynamite Roll)");
  });

  it("ignores blank option names and tolerates bad shapes", () => {
    expect(
      orderItemLine({
        id: "1",
        name_snapshot: "Chicken",
        quantity: 1,
        modifiers: [{ name: "  " }, {}, { name: null }],
      }),
    ).toBe("1× Chicken");
  });
});

describe("summariseOrderItems", () => {
  it("returns null for an empty basket", () => {
    expect(summariseOrderItems([])).toBeNull();
  });

  it("lists every line when within the cap, options included", () => {
    expect(
      summariseOrderItems([
        { id: "1", name_snapshot: "Chicken", quantity: 1, modifiers: [{ name: "oyster sauce" }] },
        { id: "2", name_snapshot: "Cola", quantity: 2 },
      ]),
    ).toBe("1× Chicken (oyster sauce), 2× Cola");
  });

  it("caps the list and counts the rest", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      name_snapshot: `Dish ${i}`,
      quantity: 1,
    }));
    expect(summariseOrderItems(items)).toBe(
      "1× Dish 0, 1× Dish 1, 1× Dish 2 +2 more",
    );
  });
});
