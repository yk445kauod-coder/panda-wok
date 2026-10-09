import { describe, expect, it } from "vitest";
import {
  orderItemLine,
  readDeliveryContact,
  summariseOrderItems,
} from "@/lib/services/admin-orders";

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

/**
 * The rider needs the name and number the customer gave *for this delivery*,
 * which `place_order` stores in `address_snapshot`. The account profile is only
 * a fallback — a customer may order for someone else, and a profile phone can be
 * malformed signup input. Before this, the admin order page rendered the profile
 * phone and ignored the snapshot, so the rider could be sent to the wrong number.
 */
describe("readDeliveryContact", () => {
  it("reads the delivery contact off the snapshot", () => {
    expect(
      readDeliveryContact({ contact_name: "Enjy", contact_phone: "+201276761163" }),
    ).toEqual({ name: "Enjy", phone: "+201276761163" });
  });

  it("returns nulls for an absent or non-object snapshot", () => {
    expect(readDeliveryContact(null)).toEqual({ name: null, phone: null });
    expect(readDeliveryContact("pickup")).toEqual({ name: null, phone: null });
    expect(readDeliveryContact({})).toEqual({ name: null, phone: null });
  });

  it("ignores blank and non-string values", () => {
    expect(readDeliveryContact({ contact_name: "   ", contact_phone: 12345 })).toEqual({
      name: null,
      phone: null,
    });
  });

  it("trims a padded value", () => {
    expect(readDeliveryContact({ contact_name: "  Enjy  " })).toEqual({
      name: "Enjy",
      phone: null,
    });
  });
});

