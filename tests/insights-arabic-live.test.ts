import { describe, expect, it } from "vitest";

const enabled = process.env.AI_LIVE === "1";
const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const ARABIC = /[\u0600-\u06FF]/;

/**
 * Live probe for the "always Arabic" guarantee on /admin/crm/insights.
 *
 * The deterministic pass builds every finding in Egyptian Arabic, and the model
 * is instructed to write the narrative in Egyptian Arabic too. The page renders
 * both through the admin-side dictionary (getAdminLocale — Arabic-first), so a
 * staff member never sees English copy here.
 */
describe.skipIf(!enabled || !hasSupabase)("insights are Arabic-first (live)", () => {
  it("deterministic insights + model narrative are in Arabic", async () => {
    const { generateInsights } = await import("@/lib/crm/insights");
    // The page passes a hardcoded Arabic-first system instruction (FALLBACK_INSTRUCTION);
    // the DB prompt may override, but the deterministic pass and the user
    // message are Arabic whatever the model does.
    const prompt =
      "أنت المحلل التشغيلي لمطبخ Panda Wok السحابي في الإسكندرية، مصر. بتتكلم مصري عامي بسيط ومباشر، وبتكتب لصاحب المطعم مش لمبرمج. قواعد: استخدم بس الـ DATA اللي في رسالة المستخدم؛ ممنوع تختلق رقم؛ خلّي الرد أقل من 220 كلمة بالفقرات القصيرة.";

    const report = await generateInsights({
      days: 30,
      systemInstruction: prompt,
      actorId: null,
    });

    // Every deterministic finding — title, observation, action, confidence
    // reason, evidence — must carry Arabic script.
    for (const item of report.deterministic) {
      for (const field of [
        item.title,
        item.observation,
        item.suggestedAction,
        item.confidenceReason,
        ...item.evidence,
      ]) {
        expect(field, `non-Arabic insight text [${item.key}]`).toMatch(ARABIC);
      }
      expect(["low", "medium", "high"]).toContain(item.confidence);
      expect(item.source).toBe("data");
    }

    // The narrative (when the model answered, not the deterministic floor) must
    // also be Arabic — the system prompt says so and the user message asks for
    // "اكتب ملاحظاتك دلوقتي بالمصري".
    if (report.aiNarrative) {
      expect(report.aiNarrative, "model narrative should be Arabic").toMatch(ARABIC);
    }

    console.log(
      "status:", report.status,
      "| provider:", report.provider,
      "| model:", report.model,
      "| findings:", report.deterministic.length,
      "| narrativeChars:", report.aiNarrative?.length ?? 0,
    );
  }, 120_000);
});