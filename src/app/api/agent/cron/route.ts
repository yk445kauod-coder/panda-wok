import { NextResponse } from "next/server";
import { tryCreateAdminSupabase } from "@/lib/supabase/server";
import { bearerFrom, verifyCronToken } from "@/lib/agent/cron-token";
import { runOpsReport, persistOpsReport } from "@/lib/agent/ops-agent";
import { runAgentTurn } from "@/lib/agent/conversation";
import { capabilitiesFor } from "@/lib/auth/rbac";

import { createExportJob } from "@/lib/export/create";
import { isExportDataset } from "@/lib/export/build";

export const dynamic = "force-dynamic";

/**
 * The scheduled entry point for the ops agent.
 *
 * Called by the `panda-wok-agent-tick` pg_cron job (see the `agent_cron`
 * migration) every 15 minutes, this route is what actually runs the report. It
 * refuses anything without the bearer token — there is no cookie fallback,
 * because a browser must never be able to trigger a scheduled run.
 *
 * Two layers of idempotency protect against an overlapping tick or a retried
 * request:
 *   1. `ops_agent_due('report')` — the same predicate the cron SQL already
 *      checked, re-checked here because the endpoint is public.
 *   2. the cadence is read at fire time, so a paused agent reports "not due" and
 *      exits without work.
 *
 * A not-due call is a success, not an error: the scheduler ticks often, and only
 * some ticks should run.
 */
export async function POST(request: Request) {
  if (!(await verifyCronToken(bearerFrom(request)))) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { data: due, error: dueError } = await admin.rpc("ops_agent_due", {
    p_kind: "report",
  });
  if (dueError) {
    return NextResponse.json({ error: dueError.message }, { status: 500 });
  }
  if (!due) {
    return NextResponse.json({ ok: true, skipped: "not_due" });
  }

  const started = Date.now();
  try {
    const { report, provider, model } = await runOpsReport({
      trigger: "schedule",
      proposalsEnabled: true,
    });
    const runId = await persistOpsReport({
      report,
      provider,
      model,
      trigger: "schedule",
      durationMs: Date.now() - started,
    });

    // Then run any scheduled automations that have come due. They are handled
    // in the same tick so one cron job drives both surfaces.
    const automationResults = await runDueAutomations();

    return NextResponse.json({
      ok: true,
      runId,
      provider,
      actions: report.actions.length,
      automations: automationResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled run failed.";
    // Record the failure so the console shows it rather than a silent gap.
    await admin.rpc("record_agent_run", {
      p_kind: "report",
      p_trigger: "schedule",
      p_status: "failed",
      p_headline: "Scheduled run failed",
      p_summary: message.slice(0, 500),
      p_report: {},
      p_actions_proposed: 0,
      p_provider: "unknown",
      p_model: "unknown",
      p_error: message.slice(0, 500),
      p_duration_ms: Date.now() - started,
    });
    return NextResponse.json({ error: "run_failed" }, { status: 500 });
  }
}


/**
 * Runs every enabled automation whose `next_run_at` has passed, then schedules
 * the next occurrence. Each automation is isolated: one failure records its own
 * error and does not stop the others.
 */
async function runDueAutomations(): Promise<{ id: string; name: string; status: string }[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  const { data: due } = await admin
    .from("agent_automations")
    .select("id, name, kind, prompt, payload, notify")
    .eq("is_enabled", true)
    .lte("next_run_at", new Date().toISOString())
    .limit(10);

  const results: { id: string; name: string; status: string }[] = [];
  for (const job of due ?? []) {
    let status = "ok";
    let error: string | null = null;
    try {
      if (job.kind === "report") {
        const { report, provider, model } = await runOpsReport({
          trigger: "schedule",
          proposalsEnabled: true,
        });
        const runId = await persistOpsReport({
          report,
          provider,
          model,
          trigger: "schedule",
          durationMs: 0,
        });
        if (job.notify) {
          await admin.rpc("notify_staff", {
            p_roles: ["owner", "admin"],
            p_category: "agent",
            p_kind: "scheduled_report",
            p_title: job.name,
            p_body: report.headline ?? "Scheduled business report is ready.",
            p_link: "/admin/agent",
          });
        }
        status = runId ? "ok" : "ok";
      } else if (job.kind === "agent" && job.prompt) {
        // Scheduled agent prompts run with owner capabilities and auto-apply
        // off — a scheduled job must never mutate without a human in the loop.
        const result = await runAgentTurn({
          question: job.prompt,
          capabilities: capabilitiesFor("owner"),
          confirmWrites: true,
        });
        if (job.notify) {
          await admin.rpc("notify_staff", {
            p_roles: ["owner", "admin"],
            p_category: "agent",
            p_kind: "scheduled_agent",
            p_title: job.name,
            p_body: result.answer.slice(0, 800),
            p_link: "/admin/agent/chat",
          });
        }
      } else if (job.kind === "export") {
        const dataset = String((job.payload as { dataset?: string } | null)?.dataset ?? "orders");
        if (isExportDataset(dataset)) {
          await createExportJob({ dataset, format: "csv", requestedBy: null });
        }
      }
    } catch (caught) {
      status = "failed";
      error = caught instanceof Error ? caught.message : "automation failed";
    }
    await admin.rpc("record_automation_run", {
      p_id: job.id,
      p_status: status,
      p_error: error ?? undefined,
    });
    results.push({ id: job.id, name: job.name, status });
  }
  return results;
}

/** A liveness probe that never reveals whether a token is configured. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "ops-agent-cron" });
}
