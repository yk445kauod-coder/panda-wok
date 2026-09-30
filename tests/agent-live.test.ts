import { describe, expect, it } from "vitest";
import { buildDbProviderChain, loadDbProviders, providerSupportsTools } from "@/lib/ai/provider";
import { callAgentTool } from "@/lib/agent/tools";
import { runAgentTurn } from "@/lib/agent/conversation";
import { capabilitiesFor } from "@/lib/auth/rbac";
import { findUngroundedFigures } from "@/lib/agent/grounding";

/**
 * Live agent smoke test: runs the real loop against the live database and the
 * owner-configured provider chain.
 *
 * This is the test that would have caught the tool-calling outage. Static
 * checks, the build and every unit test passed while the loop never executed a
 * single tool, because the failure was a silently-skipped method call. The
 * assertion that matters is therefore `steps.length > 0` — an answer alone
 * proves nothing, since the model can write a confident sentence with no data
 * behind it.
 *
 * Opt-in via AI_LIVE=1 because it costs live model calls and needs network.
 */
const enabled = process.env.AI_LIVE === "1";
const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!enabled || !hasSupabase)("agent tool calling (live)", () => {
  it("offers a tool-capable provider in the agentic chain", async () => {
    const rows = await loadDbProviders();
    const chain = await buildDbProviderChain({ rows, binding: null }, () => "floor", "agentic");
    const ordered = [chain.primary, ...chain.fallbacks].filter(Boolean);
    expect(ordered.some((p) => providerSupportsTools(p!))).toBe(true);
  }, 60_000);

  it("reaches the live database through every registered tool", async () => {
    const menu = await callAgentTool("menu_summary", {});
    const data = menu.data as { dishCount: number; categories: unknown[] };
    // The catalogue is live and non-empty; a zero here means the read, not the menu.
    expect(data.dishCount).toBeGreaterThan(0);
    expect(data.categories.length).toBeGreaterThan(0);

    const lookup = await callAgentTool("menu_item_lookup", { query: "combo" });
    expect((lookup.data as { matches: unknown[] }).matches.length).toBeGreaterThan(0);

    // These three are staff-RLS tables. They must resolve rather than throw,
    // which is what makes them usable from a background run with no request.
    await expect(callAgentTool("offers_list", {})).resolves.toBeTruthy();
    await expect(callAgentTool("stock_status", {})).resolves.toBeTruthy();
    await expect(callAgentTool("orders_metrics", {})).resolves.toBeTruthy();
    await expect(callAgentTool("business_settings", {})).resolves.toBeTruthy();
  }, 120_000);

  it("executes a real tool and grounds the answer in its result", async () => {
    const result = await runAgentTurn({
      question: "المنيو فيه كام طبق وكام قسم دلوقتي؟",
      capabilities: capabilitiesFor("owner"),
      confirmWrites: true,
    });

    // The whole point: a tool actually ran.
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.some((s) => s.status === "ok")).toBe(true);

    const observations = result.steps.filter((s) => s.status === "ok").map((s) => s.data);
    expect(findUngroundedFigures(result.answer, observations)).toEqual([]);
  }, 240_000);

  it("turns a hard document request into real files, not a claim", async () => {
    // The owner's exact hard task. It failed twice in production: once with an
    // empty turn, once with the model saying the deck was ready while it had
    // never called create_document. The assertion is therefore on the artifacts,
    // not on the prose — a confident answer proves nothing.
    const result = await runAgentTurn({
      question: "اعملي تقارير مفصلة و عرض تقديمي يشرح حالتنا",
      capabilities: capabilitiesFor("owner"),
      confirmWrites: true,
    });

    const created = result.steps.filter(
      (s) => s.tool === "create_document" && s.status === "ok",
    );
    expect(created.length).toBeGreaterThan(0);

    // A document claimed in the answer must be one the turn actually made.
    if (result.answer.includes("Deliverables")) {
      expect(created.length).toBeGreaterThan(0);
    }
  }, 300_000);
});
