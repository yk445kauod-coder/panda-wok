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
    if (snapshot.contact.whatsapp) parts.push(`WhatsApp ${snapshot.contact.whatsapp}`);
    if (snapshot.contact.email) parts.push(`email ${snapshot.contact.email}`);
    lines.push(
      parts.length > 0
        ? `You can reach ${snapshot.brand.name} on ${parts.join(", ")}.`
        : `A direct phone number has not been published on the site yet. Please use the contact page to send us a message and the kitchen will reply.`,
    );
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
      const available = snapshot.items.filter((i) => i.available);
      lines.push(
        `I can help with the ${snapshot.brand.name} menu, prices, allergens, delivery and loyalty points. Here is what is on right now:`,
      );
      lines.push("");
      const byCategory = new Map<string, typeof available>();
      for (const item of available) {
        const list = byCategory.get(item.category) ?? [];
        list.push(item);
        byCategory.set(item.category, list);
      }
      for (const [category, items] of byCategory) {
        lines.push(
          `${category}: ${items.map((i) => `${i.name} (${i.price} EGP)`).join(", ")}`,
        );
      }
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
 */
export async function answerAssistantQuestion(params: {
  question: string;
  history?: ChatMessage[];
  systemInstruction: string;
}): Promise<{ result: AssistantAnswer; snapshot: GroundingSnapshot }> {
  const snapshot = await buildGroundingSnapshot();
  const dataBlock = renderSnapshot(snapshot);

  const [providers, binding] = await Promise.all([loadDbProviders(), getWorkersAiBinding()]);
  const chain = await buildDbProviderChain({ rows: providers, binding }, (request) => {
    // The deterministic provider recovers the raw question from the last user
    // turn and answers straight from the snapshot.
    const lastUser = [...request.messages]
      .reverse()
      .find((m) => m.role === "user");
    return renderDeterministicAnswer(snapshot, lastUser?.content ?? "");
  });

  const messages: ChatMessage[] = [
    { role: "system", content: params.systemInstruction },
    ...(params.history ?? []),
    {
      role: "user",
      content: `DATA\n----\n${dataBlock}\n----\n\nQUESTION: ${params.question}`,
    },
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
  };
}
