import "server-only";

import type { GroundingSnapshot } from "@/lib/ai/grounding";

/**
 * The cards the assistant may show, chosen entirely from the live menu.
 *
 * This is the anti-fabrication boundary for the chat UI. The model never
 * decides which dishes appear: it writes prose, and these items are selected
 * here by matching the customer's question against rows that already exist in
 * the database. A dish card can therefore only ever show a real dish, with its
 * real price and its real photo. If nothing matches, no cards are shown at all
 * rather than an invented suggestion.
 */
export type AssistantMenuCard = {
  slug: string;
  name: string;
  /** Localised Arabic name, when the dish has one. */
  nameAr: string | null;
  category: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string;
  available: boolean;
  spicy: boolean;
  vegetarian: boolean;
  vegan: boolean;
  containsNuts: boolean;
  calories: number | null;
};

/** Question tokens that carry no dish meaning, so they never match a name. */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "without", "you", "your", "have", "has", "any",
  "what", "which", "who", "how", "much", "cost", "price", "menu", "food",
  "dish", "dishes", "eat", "order", "get", "want", "need", "can", "could",
  "please", "recommend", "something", "some", "give", "show", "tell", "about",
  "from", "that", "this", "there", "here", "are", "is", "do", "does", "it",
  "my", "me", "of", "in", "on", "to", "a", "an", "or", "not", "no", "yes",
  "token", "token", "best", "good", "nice", "tasty", "under", "over", "less",
  "more", "than", "cheap", "cheapest", "affordable", "budget", "popular",
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/**
 * Picks at most `limit` dishes from the snapshot to render as cards.
 *
 * `exclude` is the customer's own transcript of already-mentioned dishes: the
 * cards are re-selected every turn, and repeating the same three dishes down a
 * conversation reads as a bug even when each card is correct.
 */
export function selectMenuCards(
  snapshot: GroundingSnapshot,
  question: string,
  options: { exclude?: string[]; limit?: number } = {},
): AssistantMenuCard[] {
  const limit = options.limit ?? 3;
  const lower = question.toLowerCase();
  const excluded = new Set((options.exclude ?? []).map((s) => s.toLowerCase()));
  const tokens = tokenise(question);

  // Which attribute the question is really about. The first matching intent
  // wins, so "spicy vegetarian" resolves to the more specific filter.
  const wantsVegan = /\bvegan\b|نباتي صرف/.test(lower);
  const wantsVegetarian = /\bvegetarian\b|\bveg\b|نباتي/.test(lower);
  const wantsSpicy = /\bspic|\bhot\b|chilli|chili|حار/.test(lower);
  const wantsNoNuts = /nut[- ]?free|no nuts|without nuts|بدون مكسرات|مكسرات/.test(lower);
  const wantsCheap = /cheap|cheapest|affordab|budget|under|less than|رخيص|أرخص|ارخص/.test(lower);

  // A stated ceiling ("under 150") is respected as a hard filter.
  const ceiling = /\b(?:under|below|less than|أقل من|تحت)\s*(\d{2,4})/.exec(lower);
  const maxPrice = ceiling ? Number(ceiling[1]) : null;

  const scored = snapshot.items
    .map((item) => {
      const haystack =
        `${item.name} ${item.nameAr ?? ""} ${item.slug} ${item.description ?? ""} ${item.category}`.toLowerCase();
      let score = tokens.reduce((sum, token) => (haystack.includes(token) ? sum + 1 : sum), 0);
      // A name hit is a much stronger signal than a hit in prose. Arabic names
      // matter here too: an Arabic question must match an Arabic dish name.
      if (tokens.some((token) => item.name.toLowerCase().includes(token))) score += 3;
      if (tokens.some((token) => (item.nameAr ?? "").includes(token))) score += 3;
      return { item, score };
    })
    .filter(({ item }) => {
      if (!item.available) return false;
      if (excluded.has(item.slug.toLowerCase())) return false;
      if (wantsVegan && !item.vegan) return false;
      if (wantsVegetarian && !(item.vegetarian || item.vegan)) return false;
      if (wantsSpicy && !item.spicy) return false;
      if (wantsNoNuts && item.containsNuts) return false;
      if (maxPrice !== null && item.price > maxPrice) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price);

  const matched = scored.filter((row) => row.score > 0);
  let chosen = matched;

  // No dish-name match: fall back by intent, so "what's cheap?" or "anything
  // spicy?" still shows real cards instead of nothing.
  if (chosen.length === 0) {
    if (wantsCheap) {
      chosen = [...scored].sort((a, b) => a.item.price - b.item.price);
    } else if (wantsSpicy || wantsVegetarian || wantsVegan || wantsNoNuts) {
      chosen = scored;
    }
  }

  return chosen.slice(0, limit).map(({ item }) => ({
    slug: item.slug,
    name: item.name,
    nameAr: item.nameAr,
    category: item.category,
    price: item.price,
    description: item.description,
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt ?? item.name,
    available: item.available,
    spicy: item.spicy,
    vegetarian: item.vegetarian,
    vegan: item.vegan,
    containsNuts: item.containsNuts,
    calories: item.calories,
  }));
}
