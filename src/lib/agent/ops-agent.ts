import "server-only";
import { tryCreateAdminSupabase } from "@/lib/supabase/server";
import {
  buildDbProviderChain,
  loadDbProviders,
  runCompletion,
} from "@/lib/ai/provider";
import {
  buildDeterministicInsights,
  collectInsightData,
  getAiUsage,
  getDashboardMetrics,
} from "@/lib/crm/insights";
import { listStockItems } from "@/lib/services/admin-catalog";
import { recall, renderMemoryContext, remember } from "@/lib/agent/memory";
import { retrieveSkills, renderSkillContext } from "@/lib/agent/skills";
import { renderToolCatalogue } from "@/lib/agent/tools";
import { createExportJob, type ExportDataset } from "@/lib/export/create";
import type { Json } from "@/lib/types/database";

/**
 * The owner-facing ops agent.
 *
 * It runs on a schedule, reads the business through the existing services, and
 * writes a report. It may also *propose* actions, but every action lands in the
 * approval queue: there is no code path here that sends a broadcast, changes a
 * price or alters the menu on its own. Approval is a separate, human step.
 *
 * The model is optional — the chain degrades to the deterministic floor, and a
 * rule-based proposal builder produces the same report shape without a model, so
 * the agent is useful on a fresh deployment and sharper with a provider.
 */

export type OpsAgentActionKind =
  | "newsletter"
  | "reengage"
  | "restock"
  | "publish_insights"
  | "price_review"
  | "menu_gap"
  | "loyalty_tuning"
  | "export";

const VALID_ACTION_KINDS: ReadonlySet<string> = new Set<OpsAgentActionKind>([
  "newsletter",
  "reengage",
  "restock",
  "publish_insights",
  "price_review",
  "menu_gap",
  "loyalty_tuning",
  "export",
]);

/** Mirrors the datasets `create_export()` accepts, so a bad kind fails early. */
const EXPORT_DATASETS: ReadonlySet<string> = new Set([
  "users",
  "orders",
  "order_items",
  "feedback",
  "loyalty",
  "menu",
  "stock",
  "activity",
  "analytics",
  "ai_usage",
  "segments",
]);

export type ProposedAction = {
  kind: OpsAgentActionKind;
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
};

export type OpsReport = {
  headline: string;
  summary: string;
  metrics: Record<string, unknown>;
  recommendations: { title: string; detail: string; severity: string }[];
  actions: ProposedAction[];
};

/** Extracts the first balanced JSON object from a model reply. */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Turns deterministic insights into proposed actions. This is both the no-model
 * path and the safety net when a model reply is unusable, so the owner always
 * gets a reviewable queue.
 */
export function deterministicActions(
  insights: { title: string; detail: string; severity: string }[],
): ProposedAction[] {
  const actions: ProposedAction[] = [];

  for (const insight of insights) {
    const lower = `${insight.title} ${insight.detail}`.toLowerCase();
    if (/(restock|stock|low|out of|running out)/.test(lower)) {
      actions.push({
        kind: "restock",
        title: insight.title,
        rationale: insight.detail,
        payload: { source: "insights", severity: insight.severity },
      });
    } else if (/(win.?back|re.?engage|inactive|lapsed|churn)/.test(lower)) {
      actions.push({
        kind: "reengage",
        title: insight.title,
        rationale: insight.detail,
        payload: { source: "insights", severity: insight.severity },
      });
    } else if (/(price|margin|cost)/.test(lower)) {
      actions.push({
        kind: "price_review",
        title: insight.title,
        rationale: insight.detail,
        payload: { source: "insights", severity: insight.severity },
      });
    }
  }

  actions.push({
    kind: "publish_insights",
    title: "Record this week's insights in the console",
    rationale: "Makes the analysis visible to every admin, not only the run log.",
    payload: { count: insights.length },
  });

  // A standing "the data is available" proposal. Exporting is read-only and
  // reversible, so it is safe to offer every run; the approval gate still applies,
  // because a large export is a real cost and a real data-egress event.
  actions.push({
    kind: "export",
    title: "Produce an orders export for the last period",
    rationale: "Read-only snapshot for accounting, no live effect until approved.",
    payload: { dataset: "orders", format: "csv" },
  });

  return actions;
}

/**
 * Builds the report from live data. Observation and metrics always happen;
 * `proposalsEnabled` only gates whether actions are attached.
 */
export async function runOpsReport(params: {
  trigger: "schedule" | "manual" | "cron";
  proposalsEnabled: boolean;
}): Promise<{ report: OpsReport; provider: string; model: string }> {
  const [metrics, insightData, aiUsage, stock] = await Promise.all([
    getDashboardMetrics(30),
    collectInsightData(30),
    getAiUsage(30),
    listStockItems(),
  ]);

  const recommendations = buildDeterministicInsights(insightData).map((i) => ({
    title: i.title,
    detail: [i.observation, i.suggestedAction].filter(Boolean).join(" "),
    severity: i.confidence === "high" ? "high" : i.confidence === "medium" ? "medium" : "low",
  }));

  const lowStock = stock
    .filter((s) => s.status === "low" || s.status === "out")
    .slice(0, 12)
    .map((s) => ({ name: s.name_en, status: s.status, quantity: s.quantity }));

  const snapshot = {
    windowDays: 30,
    metrics,
    insights: recommendations.slice(0, 10),
    lowStock,
    aiUsage: aiUsage.totals,
  };

  const chain = await buildDbProviderChain({ rows: await loadDbProviders(), binding: null }, () =>
    JSON.stringify({ headline: "", summary: "", recommendations: [], actions: [] }),
  );

  let provider = "deterministic";
  let model = "menu-grounded-rules";
  const headline = recommendations[0]?.title ?? "Business report";
  const summary = recommendations.map((r) => r.detail).join(" ");
  let actions = params.proposalsEnabled ? deterministicActions(recommendations) : [];

  if (chain.primary || chain.fallbacks.length > 0) {
    // Cheap, task-relevant context: a few recalled owner memories and the few
    // skill chunks that match this run, never a full document dump.
    const [ownerMemory, skillChunks] = await Promise.all([
      recall({ query: `ops report ${headline}`, scope: "owner", matchCount: 4 }),
      retrieveSkills("operations report analysis proposals", 4),
    ]);
    const memoryBlock = renderMemoryContext(ownerMemory);
    const skillBlock = renderSkillContext(skillChunks);

    const prompt = [
      "حلّل لقطة بيانات العمل الحقيقية دي، وردّ بـ JSON بالشكل ده بالظبط:",
      '{"headline": string, "summary": string, "recommendations": [{"title","detail","severity"}], "actions": [{"kind","title","rationale","payload"}]}',
      `أنواع الإجراءات المسموحة: ${[...VALID_ACTION_KINDS].join(", ")}`,
      params.proposalsEnabled
        ? "اقترح 4 إجراءات كحد أقصى، وكل واحد بـ payload محدّد."
        : "خلي actions مصفوفة فاضية.",
      "اكتب كل النصوص بالعامية المصرية.",
      "أي رقم تذكره لازم يكون موجود بالظبط في اللقطة دي. ممنوع التقدير أو التقريب أو اختراع أي رقم — لو رقم مش موجود قول إنه غير متاح.",
      // Tools are named, not executed: the agent states which read would settle
      // a question instead of the run pulling every table into context.
      `أدوات القراءة المتاحة (الاسم: الغرض) —\n${renderToolCatalogue()}`,
      memoryBlock ? `سياق المالك:\n${memoryBlock}` : null,
      skillBlock ? `إرشادات ذات صلة:\n${skillBlock}` : null,
      "اللقطة:",
      JSON.stringify(snapshot),
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const run = await runCompletion(chain, {
        messages: [
          {
            role: "system",
            content:
              "أنت محلّل التشغيل لمطبخ Panda Wok السحابي في مصر. اردّ بـ JSON صارم فقط — بدون شرح حواليه وبدون علامات كود. " +
              "اكتب بالعامية المصرية. ممنوع تمامًا اختلاق أي رقم: كل رقم لازم يكون موجود في اللقطة المرفقة.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 900,
      });
      provider = run.provider;
      model = run.model;

      const parsed = parseJsonObject(run.text);
      if (parsed) {
        if (params.proposalsEnabled) {
          const raw = Array.isArray(parsed.actions) ? parsed.actions : [];
          const cleaned = raw
            .map((entry) => {
              const a = entry as Record<string, unknown>;
              const kind = String(a.kind ?? "");
              if (!VALID_ACTION_KINDS.has(kind)) return null;
              return {
                kind: kind as OpsAgentActionKind,
                title: String(a.title ?? "Proposed action").slice(0, 200),
                rationale: String(a.rationale ?? "").slice(0, 1000),
                payload: (typeof a.payload === "object" && a.payload !== null
                  ? a.payload
                  : {}) as Record<string, unknown>,
              };
            })
            .filter((a): a is ProposedAction => a !== null);
          actions = cleaned.length > 0 ? cleaned : deterministicActions(recommendations);
        }
      }
    } catch (error) {
      console.warn(
        `[ops-agent] model reasoning failed, using deterministic report: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    report: {
      headline,
      summary,
      metrics: metrics as unknown as Record<string, unknown>,
      recommendations,
      actions,
    },
    provider,
    model,
  };
}

/** Persists a report and enqueues its actions. Nothing is applied here. */
export async function persistOpsReport(params: {
  report: OpsReport;
  provider: string;
  model: string;
  trigger: "schedule" | "manual" | "cron";
  durationMs: number;
}): Promise<string> {
  const admin = tryCreateAdminSupabase();
  if (!admin) throw new Error("The ops agent needs the service-role key on the server.");

  const { data: runId, error } = await admin.rpc("record_agent_run", {
    p_kind: "report",
    p_trigger: params.trigger,
    p_status: "ready",
    p_headline: params.report.headline,
    p_summary: params.report.summary,
    p_report: params.report as unknown as Json,
    p_actions_proposed: params.report.actions.length,
    p_provider: params.provider,
    p_model: params.model,
    p_error: "",
    p_duration_ms: params.durationMs,
  });
  if (error) throw new Error(error.message);

  for (const action of params.report.actions) {
    const { error: enqueueError } = await admin.rpc("enqueue_ops_action", {
      p_run_id: runId as string,
      p_kind: action.kind,
      p_title: action.title,
      p_rationale: action.rationale,
      p_payload: action.payload as unknown as Json,
      p_requires_approval: true,
    });
    if (enqueueError) {
      console.warn(`[ops-agent] could not enqueue action: ${enqueueError.message}`);
    }
  }

  // A compact digest becomes owner memory, so the next run can reference what
  // was reported last time instead of rediscovering it.
  await remember({
    scope: "owner",
    kind: "ops_report",
    content: `${params.report.headline}. ${params.report.summary}`.slice(0, 800),
    metadata: { runId: runId as string, trigger: params.trigger },
  }).catch(() => null);

  return runId as string;
}

/**
 * Applies an *approved* action. The only place a proposal becomes a real effect,
 * and reachable only after a human approved the row. Each kind is handled
 * explicitly; an unknown kind fails loudly rather than silently doing nothing.
 */
export async function applyOpsAction(action: {
  id: string;
  kind: string;
  title: string;
  rationale: string | null;
  payload: Record<string, unknown>;
  /** The owner who approved it — the accountable actor for any effect. */
  approvedBy: string | null;
}): Promise<{ ref: string }> {
  const admin = tryCreateAdminSupabase();
  if (!admin) throw new Error("The ops agent needs the service-role key on the server.");

  switch (action.kind) {
    case "newsletter":
    case "reengage": {
      const title = String(action.payload.title ?? action.title).trim();
      const body = String(action.payload.body ?? action.rationale ?? "").trim();
      // A broadcast targets a saved segment by name/id. The approved payload
      // carries the exact segment so approval sends to what was reviewed.
      const segment = String(action.payload.segment ?? "all");
      const segmentValue =
        action.payload.segmentValue !== undefined && action.payload.segmentValue !== null
          ? Number(action.payload.segmentValue)
          : undefined;
      if (!title || !body) throw new Error("The approved action has no title/body to send.");

      const { data, error } = await admin.rpc("send_broadcast", {
        p_title: title,
        p_body: body,
        p_channel: "in_app",
        p_segment: segment,
        p_segment_value: segmentValue,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return { ref: row?.broadcast_id ? String(row.broadcast_id) : "sent" };
    }

    case "publish_insights":
    case "restock":
    case "price_review":
    case "menu_gap": {
      // Advisory kinds: approving records the decision and notifies owners. There
      // is deliberately no automatic stock/price/menu mutation — those change the
      // live site and are done by a human in the CMS with full context.
      const ref = await notifyOwners(
        action.kind === "publish_insights" ? action.title : `Approved: ${action.title}`,
        action.rationale,
      );
      return { ref };
    }

    case "loyalty_tuning": {
      const userIds = Array.isArray(action.payload.userIds) ? (action.payload.userIds as string[]) : [];
      const points = Number(action.payload.points ?? 0);
      if (userIds.length === 0 || !Number.isFinite(points) || points <= 0) {
        throw new Error("loyalty_tuning needs userIds[] and a positive points value.");
      }
      const { error } = await admin.rpc("gift_loyalty_points", {
        p_user_ids: userIds,
        p_points: points,
        p_reason: action.title,
      });
      if (error) throw new Error(error.message);
      return { ref: `granted:${userIds.length}` };
    }

    case "export": {
      // Reuses the Admin exports path (`createExportJob`), so there is one
      // implementation and the file lands in the same exports list a human uses.
      const dataset = String(action.payload.dataset ?? "").trim();
      const format = String(action.payload.format ?? "csv").trim().toLowerCase();
      if (!dataset) throw new Error("The approved export has no dataset.");
      if (!EXPORT_DATASETS.has(dataset)) {
        throw new Error(`"${dataset}" is not an exportable dataset.`);
      }
      if (format !== "csv" && format !== "json") {
        throw new Error("Export format must be csv or json.");
      }
      const { id, rows } = await createExportJob({
        dataset: dataset as ExportDataset,
        format,
        // An agent-initiated export is attributed to the approving owner, not to
        // the agent: the owner is the accountable actor for the file.
        requestedBy: action.approvedBy,
      });
      return { ref: `export:${id}:${rows}` };
    }

    default:
      throw new Error(`Action kind "${action.kind}" has no apply handler.`);
  }
}

/** Notifies every owner/admin in-app. Returns a reference for the ledger. */
async function notifyOwners(title: string, body: string | null): Promise<string> {
  const admin = tryCreateAdminSupabase();
  if (!admin) throw new Error("Service role required.");

  const { data: owners } = await admin.from("staff").select("user_id").in("role", ["owner", "admin"]);
  const rows = (owners ?? [])
    .filter((o) => o.user_id)
    .map((o) => ({
      user_id: o.user_id as string,
      kind: "ops_agent",
      title,
      body,
      link: "/admin/agent",
    }));
  if (rows.length > 0) {
    const { error } = await admin.from("notifications").insert(rows);
    if (error) throw new Error(error.message);
  }
  return `notified:${rows.length}`;
}
