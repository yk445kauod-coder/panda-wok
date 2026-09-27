import { describe, expect, it } from "vitest";
import { selectMenuCards } from "@/lib/ai/menu-cards";
import type { GroundingSnapshot } from "@/lib/ai/grounding";

/**
 * These tests are the anti-fabrication guarantee for the chat dish cards: the
 * selector may only ever return rows that were handed to it, and every card's
 * money and identity come from that row rather than from the question.
 */

function item(over: Partial<GroundingSnapshot["items"][number]>) {
  return {
    slug: "kung-pao-chicken",
    name: "Kung Pao Chicken",
    nameAr: "دجاج كونغ باو",
    category: "Chinese Wok",
    price: 150,
    description: "Wok-fried chicken with peanuts and dried chilli.",
    imageUrl: "https://images.unsplash.com/photo-1",
    imageAlt: "Kung Pao Chicken",
    available: true,
    spicy: true,
    vegetarian: false,
    vegan: false,
    containsNuts: true,
    allergens: ["peanuts"],
    calories: 720,
    ...over,
  };
}

const SNAPSHOT = {
  items: [
    item({}),
    item({
      slug: "veggie-chow-mein",
      name: "Veggie Chow Mein",
      nameAr: "شو مين نباتي",
      category: "Noodles",
      price: 95,
      spicy: false,
      vegetarian: true,
      containsNuts: false,
      description: "Stir-fried noodles with garden vegetables.",
    }),
    item({
      slug: "tofu-ramen",
      name: "Tofu Ramen",
      nameAr: "رامن توفو",
      category: "Ramen",
      price: 120,
      spicy: false,
      vegetarian: true,
      vegan: true,
      containsNuts: false,
      description: "Clear broth, silken tofu and spring onion.",
    }),
    item({
      slug: "sold-out-sushi",
      name: "Sold Out Sushi",
      nameAr: "سوشي",
      category: "Sushi",
      price: 200,
      available: false,
      spicy: false,
      containsNuts: false,
      description: "Salmon and avocado rolls.",
    }),
    item({
      slug: "chilli-prawns",
      name: "Chilli Prawns",
      nameAr: "جمبري حار",
      category: "Chinese Wok",
      price: 140,
      containsNuts: false,
      // Deliberately avoids the word "spicy" in the name and prose, so a
      // "spicy?" question exercises the flag filter, not a text match.
      description: "Prawns tossed with garlic and red chilli oil.",
    }),
  ],
  categories: [],
} as unknown as GroundingSnapshot;

describe("selectMenuCards", () => {
  it("matches a dish by name and returns the real row's data", () => {
    const cards = selectMenuCards(SNAPSHOT, "How much is the Kung Pao Chicken?");
    expect(cards).toHaveLength(1);
    expect(cards[0].slug).toBe("kung-pao-chicken");
    // Price and image come from the row, not from anything the customer typed.
    expect(cards[0].price).toBe(150);
    expect(cards[0].imageUrl).toBe("https://images.unsplash.com/photo-1");
  });

  it("matches an Arabic question against the Arabic dish name", () => {
    const cards = selectMenuCards(SNAPSHOT, "عايز دجاج كونغ باو");
    expect(cards.map((c) => c.slug)).toContain("kung-pao-chicken");
  });

  it("never returns an unavailable dish", () => {
    const cards = selectMenuCards(SNAPSHOT, "sushi");
    expect(cards.map((c) => c.slug)).not.toContain("sold-out-sushi");
  });

  it("filters to vegetarian when the question asks for it", () => {
    const cards = selectMenuCards(SNAPSHOT, "do you have vegetarian dishes?");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.vegetarian || c.vegan)).toBe(true);
  });

  it("filters to spicy when the question asks for it", () => {
    const cards = selectMenuCards(SNAPSHOT, "which dishes are spicy?");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.spicy)).toBe(true);
  });

  it("honours a stated price ceiling", () => {
    const cards = selectMenuCards(SNAPSHOT, "anything cheap under 100?");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.price <= 100)).toBe(true);
  });

  it("returns the cheapest first for a budget question with no dish named", () => {
    const cards = selectMenuCards(SNAPSHOT, "what is the cheapest thing?");
    expect(cards[0].slug).toBe("veggie-chow-mein");
  });

  it("drops dishes already shown in the conversation", () => {
    const first = selectMenuCards(SNAPSHOT, "which dishes are spicy?");
    expect(first.map((c) => c.slug).sort()).toEqual(["chilli-prawns", "kung-pao-chicken"]);

    const second = selectMenuCards(SNAPSHOT, "which dishes are spicy?", {
      exclude: first.map((c) => c.slug),
    });
    expect(second.map((c) => c.slug)).not.toContain("kung-pao-chicken");
    expect(second.map((c) => c.slug)).not.toContain("chilli-prawns");
  });

  it("shows nothing rather than inventing a dish for an unrelated question", () => {
    const cards = selectMenuCards(SNAPSHOT, "what is the weather in Cairo?");
    expect(cards).toEqual([]);
  });

  it("caps the number of cards", () => {
    expect(selectMenuCards(SNAPSHOT, "menu", { limit: 2 }).length).toBeLessThanOrEqual(2);
    expect(
      selectMenuCards(SNAPSHOT, "cheap", { limit: 100 }).length,
    ).toBeLessThanOrEqual(SNAPSHOT.items.length);
  });

  it("carries the dietary flags through so the card can label them", () => {
    const cards = selectMenuCards(SNAPSHOT, "tofu ramen");
    expect(cards[0].vegan).toBe(true);
    expect(cards[0].spicy).toBe(false);
  });
});
