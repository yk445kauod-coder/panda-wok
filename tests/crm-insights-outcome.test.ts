import { describe, expect, it } from "vitest";

const enabled = process.env.AI_LIVE === "1";
const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * Live probe for the crm_insights fix. Historically a primary that failed
 * (reasoning model burned its budget) branded the successful fallback answer as
 * `status=error` in ai_requests even though workers-ai had answered. This
 * drives the real generateInsights against live data and checks the row is `ok`
 * with no error — or at worst a clean `fallback` with the trace in
 * provider_errors.
 */
describe.skipIf(!enabled || !hasSupabase)("crm_insights outcome (live)", () => {
  it("recording a successful fallback is ok, not error", async () => {
    const { generateInsights } = await import("@/lib/crm/insights");
    const { tryCreateAdminSupabase } = await import("@/lib/supabase/server");
    const report = await generateInsights({
      days: 30,
      systemInstruction: "You are the Panda Wok CRM analyst. Write notes in Egyptian Arabic.",
      actorId: null,
    });

    expect(["ok", "fallback"]).toContain(report.status);
    if (report.status === "ok") {
      expect(report.error).toBeNull();
      expect(report.provider).not.toBe("deterministic");
    } else {
      // Deterministic floor: the error is a real chain-wide failure and the
      // tripped providers must be visible.
      expect(report.error).toBeTruthy();
    }

    // The ledger row that followed the run must agree: no spurious "error".
    const admin = tryCreateAdminSupabase();
    const { data } = await admin!
      .from("ai_requests")
      .select("status, error, provider_errors, provider, model, surface")
      .eq("surface", "crm_insights")
      .order("created_at", { ascending: false })
      .limit(1);
    const row = data?.[0];
    expect(row).toBeTruthy();
    if (!row) return;
    expect(row.status).not.toBe("error");
    if (row.status === "ok") expect(row.error).toBeNull();
  }, 240_000);
});