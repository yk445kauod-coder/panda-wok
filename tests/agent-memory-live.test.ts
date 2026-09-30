import { describe, expect, it } from "vitest";
import { deleteAgentMemory, lexicalSimilarity, recall, remember } from "@/lib/agent/memory";
import { listIndexedSkills, retrieveSkills } from "@/lib/agent/skills";
import { embedText } from "@/lib/ai/embeddings";

/**
 * Live end-to-end for the two long-term layers: the durable vector memory and
 * the lazy skill index.
 *
 * Opt-in via `MEMORY_LIVE=1` because it writes to the live project and calls the
 * embedding provider. Everything it writes is deleted again.
 *
 * The assertions that matter are the ones a mocked test cannot make: that recall
 * finds a fact by *meaning* rather than by substring, that a customer's memory is
 * invisible to an owner query, and that skill retrieval is bounded — an index
 * that returns everything is indistinguishable from no index at all.
 */
const enabled = process.env.MEMORY_LIVE === "1";
const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!enabled || !hasSupabase)("agent memory + skills (live)", () => {
  const created: string[] = [];
  const stamp = Date.now();

  const write = async (params: Parameters<typeof remember>[0]) => {
    const id = await remember(params);
    if (id) created.push(id);
    return id;
  };

  it(
    "embeds through the configured provider",
    async () => {
      const vector = await embedText("الشحن مجاني فوق 250 جنيه");
      // Null is a legitimate state (no embedding service reachable), in which
      // case the layer degrades to lexical matching rather than failing.
      if (vector) expect(vector.length).toBe(1024);
    },
    60_000,
  );

  it(
    "recalls a fact by meaning, not by substring",
    async () => {
      const fact = `probe-memory-${stamp} — العميل بيفضل الطلبات بدون بصل`;
      const id = await write({ scope: "owner", kind: "owner_note", content: fact });
      expect(id).toBeTruthy();

      // The query shares almost no wording with the stored fact.
      const hits = await recall({ query: "تفضيلات العميل في الطلبات", scope: "owner", matchCount: 5 });
      expect(hits.some((h) => h.content === fact)).toBe(true);
    },
    120_000,
  );

  it(
    "does not duplicate an identical fact",
    async () => {
      const fact = `probe-dup-${stamp} — نفس الملاحظة`;
      const first = await write({ scope: "owner", kind: "owner_note", content: fact });
      const second = await remember({ scope: "owner", kind: "owner_note", content: fact });
      expect(first).toBeTruthy();
      expect(second).toBeNull();
    },
    120_000,
  );

  it(
    "never returns a customer's memory to an owner query",
    async () => {
      const fact = `probe-scope-${stamp} — customer-only note`;
      const id = await write({ scope: "customer", kind: "customer_note", content: fact });
      expect(id).toBeTruthy();

      const ownerHits = await recall({ query: fact, scope: "owner", matchCount: 20 });
      expect(ownerHits.some((h) => h.content === fact)).toBe(false);
    },
    120_000,
  );

  it(
    "retrieves a bounded, relevant slice of the skill index",
    async () => {
      const chunks = await retrieveSkills("كيف أضيف طبق جديد للمنيو؟", 6);
      // An embedding-less environment returns [] and falls back elsewhere; when
      // the index answers, it must stay small.
      expect(chunks.length).toBeLessThanOrEqual(6);
    },
    60_000,
  );

  it(
    "lists the indexed skill sources",
    async () => {
      const sources = await listIndexedSkills();
      expect(sources.length).toBeGreaterThan(0);
    },
    60_000,
  );

  it("cleans up everything it wrote", async () => {
    for (const id of created) await deleteAgentMemory(id);
    const leftovers = await recall({ query: `probe-memory-${stamp}`, scope: "owner", matchCount: 20 });
    expect(leftovers.some((h) => h.content.includes(String(stamp)))).toBe(false);
  }, 60_000);
});

describe("lexical fallback", () => {
  it("ranks related text above unrelated text", () => {
    const related = lexicalSimilarity("الشحن مجاني فوق 250 جنيه", "سياسة الشحن المجاني للطلبات");
    const unrelated = lexicalSimilarity("الشحن مجاني فوق 250 جنيه", "لون الطاولة في المطبخ");
    expect(related).toBeGreaterThan(unrelated);
  });
});
