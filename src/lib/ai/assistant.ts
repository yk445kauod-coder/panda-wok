import "server-only";

import {
  buildDbProviderChain,
  loadDbProviders,
  getWorkersAiBinding,
  runCompletion,
  type ChatMessage,
  type CompletionRequest,
} from "@/lib/ai/provider";
import {
  buildGroundingSnapshot,
  renderSnapshot,
  type GroundingSnapshot,
} from "@/lib/ai/grounding";
import { recall, renderMemoryContext } from "@/lib/agent/memory";
import { retrieveSkills, renderSkillContext } from "@/lib/agent/skills";
import { selectMenuCards, type AssistantMenuCard } from "@/lib/ai/menu-cards";

/** Words that suggest the customer is asking about a specific dish or need. */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "you", "have", "any", "what",
  "which", "and", "or", "for", "with", "without", "i", "want", "need", "can",
  "me", "my", "please", "recommend", "something", "some", "of", "in", "on",
  "to", "it", "that", "this", "there", "how", "much", "cost", "price", "menu",
  "food", "dish", "dishes", "eat", "order", "get", "spicy", "vegetarian",
  "vegan", "nuts", "nut", "allergy", "allergic", "gluten", "dairy", "fish",
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * The deterministic answer. It is generated purely by matching the question
 * against live menu and settings data, so it can never state anything the
 * database does not contain. Used both as the no-provider fallback and as the
 * source of "facts" block appended to model prompts.
 */
export function renderDeterministicAnswer(
  snapshot: GroundingSnapshot,
  question: string,
): string {
  const lower = question.toLowerCase();
  const tokens = tokenise(question);
  const lines: string[] = [];

  const matchesAllergens = /allerg|intoleran|gluten|dairy|nut|shellfish|egg/i.test(lower);
  const matchesSpicy = /spic|hot|chilli|chili|mild/i.test(lower);
  const matchesVeg = /vegetarian|vegan|plant/i.test(lower);
  const matchesCheap = /cheap|affordab|budget|under|less than|price|cost/i.test(lower);
  const matchesDelivery = /deliver|delivery|how long|eta|time|fee|minimum|min order/i.test(lower);
  const matchesLoyalty = /loyalty|points|reward|tier|discount/i.test(lower);
  const matchesContact = /contact|phone|call|whatsapp|email|reach|address|where/i.test(lower);
  const matchesPay = /instapay|insta ?pay|pay|payment|wallet|transfer/i.test(lower);
  const matchesOffers = /offer|deal|discount|promo|promotion|coupon|save|cheaper/i.test(lower);
  const matchesRecommend = /recommend|suggest|popular|best|favourite|favorite|try/i.test(lower);

  if (matchesDelivery) {
    lines.push(
      `Minimum order is ${snapshot.ordering.minOrderTotal} EGP. Delivery is ${snapshot.ordering.deliveryFee} EGP and free over ${snapshot.ordering.freeDeliveryOver} EGP. A typical order takes about ${snapshot.ordering.etaMinutes} minutes plus preparation.`,
    );
    lines.push(
      snapshot.ordering.acceptingOrders
        ? "We are accepting orders right now."
        : "We are not accepting new orders at this moment.",
    );
    lines.push(`Payment options: ${snapshot.paymentMethods.join(" or ")}.`);
  }

  if (matchesContact) {
    const parts: string[] = [];
    if (snapshot.contact.phone) parts.push(`phone ${snapshot.contact.phone}`);
    if (snapshot.contact.phoneSecondary) parts.push(`a second line ${snapshot.contact.phoneSecondary}`);
    if (snapshot.contact.email) parts.push(`email ${snapshot.contact.email}`);
    lines.push(
      parts.length > 0
        ? `You can reach ${snapshot.brand.name} on ${parts.join(", ")}.`
        : `A direct phone number has not been published on the site yet. Please use the contact page to send us a message and the kitchen will reply.`,
    );
  }

  if (matchesPay || matchesDelivery) {
    if (snapshot.contact.instapayUrl) {
      lines.push(`You can pay with InstaPay here: ${snapshot.contact.instapayUrl}`);
    } else {
      lines.push("Payment is cash on delivery; an InstaPay link is not published yet.");
    }
  }

  if (matchesOffers || matchesCheap) {
    if (snapshot.offers.length > 0) {
      for (const offer of snapshot.offers) {
        const value =
          offer.kind === "percent"
            ? `${offer.value}% off`
            : `${offer.value} EGP off`;
        lines.push(
          `${offer.name}: ${value}${
            offer.threshold > 0 ? ` on orders over ${offer.threshold} EGP` : " on any order"
          }${offer.maxDiscount ? ` (up to ${offer.maxDiscount} EGP)` : ""}.`,
        );
      }
    } else if (matchesOffers) {
      lines.push("There are no offers running at the moment.");
    }
  }

  if (matchesLoyalty) {
    lines.push(
      `You earn ${snapshot.loyalty.pointsPerCurrency} point per 1 EGP spent, and each point is worth ${snapshot.loyalty.pointValue} EGP when redeemed.`,
    );
    if (snapshot.rewards.length > 0) {
      lines.push(
        "Current rewards: " +
          snapshot.rewards
            .map((r) => `${r.name} (${r.pointsCost} points)`)
            .join(", ") +
          ".",
      );
    }
  }

  // Rank dishes by how many question tokens they match.
  const scored = snapshot.items
    .map((item) => {
      const haystack = `${item.name} ${item.slug} ${item.description ?? ""} ${item.category}`.toLowerCase();
      const score = tokens.reduce(
        (sum, token) => (haystack.includes(token) ? sum + 1 : sum),
        0,
      );
      return { item, score };
    })
    .filter(({ item, score }) => {
      if (score === 0) return false;
      if (matchesVeg && !(item.vegetarian || item.vegan)) return false;
      if (matchesSpicy && !item.spicy && !/spic/.test(question.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);

  const relevant = scored.length > 0 ? scored.map((s) => s.item) : [];

  if (relevant.length > 0) {
    lines.push("");
    for (const item of relevant.slice(0, 4)) {
      const flags = [
        item.available ? null : "currently unavailable",
        item.spicy ? "spicy" : null,
        item.vegan ? "vegan" : item.vegetarian ? "vegetarian" : null,
      ].filter(Boolean);
      lines.push(
        `${item.name} — ${item.price} EGP (${item.category})${flags.length ? `, ${flags.join(", ")}` : ""}. ${item.description ?? ""}`.trim(),
      );
      if (matchesAllergens && item.allergens.length > 0) {
        lines.push(`  Recorded allergens: ${item.allergens.join(", ")}.`);
      }
    }
  }

  if (matchesAllergens) {
    lines.push("");
    lines.push(
      "Allergen information above is what is recorded on the menu. It is not a guarantee, so please confirm directly with the kitchen before ordering if you have a serious allergy.",
    );
  }

  if (matchesSpicy && relevant.length === 0) {
    const spicyItems = snapshot.items.filter((i) => i.spicy && i.available);
    lines.push(
      spicyItems.length > 0
        ? `Spicy options include ${spicyItems.map((i) => `${i.name} (${i.price} EGP)`).join(", ")}.`
        : "We do not currently have any dish marked as spicy on the menu.",
    );
  }

  if (matchesVeg && relevant.length === 0) {
    const vegItems = snapshot.items.filter((i) => (i.vegetarian || i.vegan) && i.available);
    lines.push(
      vegItems.length > 0
        ? `Vegetarian or vegan options include ${vegItems.map((i) => `${i.name} (${i.price} EGP)`).join(", ")}.`
        : "We do not currently have any dish marked vegetarian on the menu.",
    );
  }

  if (matchesCheap && relevant.length === 0) {
    const cheapest = [...snapshot.items]
      .filter((i) => i.available)
      .sort((a, b) => a.price - b.price)
      .slice(0, 3);
    if (cheapest.length > 0) {
      lines.push(
        `Lighter spend options: ${cheapest.map((i) => `${i.name} at ${i.price} EGP`).join(", ")}.`,
      );
    }
  }

  if (matchesRecommend || lines.length === 0) {
    if (lines.length === 0) {
      lines.push(
        `I can help with the ${snapshot.brand.name} menu, prices, allergens, delivery and loyalty points. Here are a few dishes — tap any card for the full detail:`,
      );
    } else if (matchesRecommend) {
      const featured = snapshot.items.filter((i) => i.available).slice(0, 2);
      if (featured.length > 0) {
        lines.push("");
        lines.push(
          `If you want a starting point: ${featured.map((i) => `${i.name} at ${i.price} EGP`).join(" or ")}.`,
        );
      }
    }
  }

  lines.push("");
  lines.push(
    "I answer from the live Panda Wok menu, so I cannot help with anything that is not listed here. For anything else, please contact the kitchen.",
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type AssistantAnswer = {
  answer: string;
  provider: string;
  model: string;
  status: "ok" | "fallback";
  latencyMs: number;
  error: string | null;
  grounded: boolean;
};

/**
 * Answers a customer question. The rendered snapshot is the only knowledge the
 * model receives, and the deterministic renderer is both the fallback and the
 * factual floor.
 *
 * `customerId`, when supplied, enables two cheap personalisation layers: a few
 * recalled memory lines (a stated preference, a recurring request) and the
 * relevant skill chunks. Both are optional and fail open — a missing embedding
 * service simply means the answer is not personalised, never that it errors.
 *
 * The returned `cards` are selected here, from live rows, and handed to the UI
 * alongside the prose. The model never sees or chooses them, so a dish card can
 * only show a dish that actually exists.
 */
export async function answerAssistantQuestion(params: {
  question: string;
  history?: ChatMessage[];
  systemInstruction: string;
  customerId?: string | null;
  /** Slugs already shown in this conversation, so cards do not repeat. */
  excludeSlugs?: string[];
}): Promise<{
  result: AssistantAnswer;
  snapshot: GroundingSnapshot;
  cards: AssistantMenuCard[];
}> {
  const snapshot = await buildGroundingSnapshot();
  const dataBlock = renderSnapshot(snapshot);

  // Chosen from the live snapshot before the model runs, so the prompt can tell
  // it which dishes the UI is already showing. The model never chooses these —
  // it is only told about them, which is why a card can never be a invented
  // dish. The deterministic fallback gets the same cards as a model reply.
  const cards = selectMenuCards(snapshot, params.question, {
    exclude: params.excludeSlugs,
    limit: 3,
  });
  const cardBlock =
    cards.length > 0
      ? `DISHES ALREADY SHOWN TO THE CUSTOMER AS CARDS (photo, name and price are on screen beneath your reply)\n` +
        cards.map((c) => `- ${c.name}`).join("\n") +
        `\nRefer to these by name only. Do not repeat their prices, do not list any other dish, and do not print a menu.`
      : "";

  const [providers, binding, memories, skills] = await Promise.all([
    loadDbProviders(),
    getWorkersAiBinding(),
    params.customerId
      ? recall({ query: params.question, scope: "customer", subjectId: params.customerId })
      : Promise.resolve([]),
    retrieveSkills(params.question, 4),
  ]);
  const memoryBlock = renderMemoryContext(memories);
  const skillBlock = renderSkillContext(skills);

  const chain = await buildDbProviderChain({ rows: providers, binding }, (request) => {
    // The deterministic provider recovers the raw question from the last user
    // turn and answers straight from the snapshot.
    const lastUser = [...request.messages]
      .reverse()
      .find((m) => m.role === "user");
    return renderDeterministicAnswer(snapshot, lastUser?.content ?? "");
  });

  const sections: string[] = [];
  if (memoryBlock) sections.push(`WHAT YOU REMEMBER ABOUT THIS CUSTOMER\n${memoryBlock}`);
  if (skillBlock) sections.push(`RELEVANT STAFF GUIDANCE\n${skillBlock}`);
  sections.push(`DATA\n----\n${dataBlock}\n----`);
  if (cardBlock) sections.push(cardBlock);
  sections.push(`QUESTION: ${params.question}`);

  const messages: ChatMessage[] = [
    { role: "system", content: params.systemInstruction },
    ...(params.history ?? []),
    { role: "user", content: sections.join("\n\n") },
  ];

  const request: CompletionRequest = {
    messages,
    temperature: 0.2,
    maxTokens: 500,
  };

  const run = await runCompletion(chain, request);

  return {
    result: {
      answer: run.text,
      provider: run.provider,
      model: run.model,
      status: run.status,
      latencyMs: run.latencyMs,
      error: run.error,
      grounded: true,
    },
    snapshot,
    cards,
  };
}
