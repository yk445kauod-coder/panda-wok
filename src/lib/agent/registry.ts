import "server-only";

import type { Capability } from "@/lib/auth/rbac";
import type { ToolSpec } from "@/lib/ai/tool-protocol";
import { callAgentTool, type AgentToolName } from "@/lib/agent/tools";
import { tryCreateAdminSupabase } from "@/lib/supabase/server";

/**
 * The tool registry the conversational agent plans against.
 *
 * It wraps the existing read tools (`lib/agent/tools.ts`) and adds the write
 * tools the owner asked for ("the agent can take action inside the admin
 * system"). The design keeps the existing safety property: reads run straight
 * away, writes are described to the model but executed through the approval
 * queue unless the operator has explicitly armed auto-apply for the session.
 *
 * A tool that a role may not use is never offered to the model, so the agent
 * cannot be talked into calling something the human could not do themselves —
 * the capability check is on the tool's metadata, not on prompt wording.
 */

export type AgentToolDef = {
  spec: ToolSpec;
  /** Capability the actor must hold to call, or execute, this tool. */
  capability: Capability;
  /** `read` runs immediately; `write` is gated by the confirmation policy. */
  mode: "read" | "write";
  /** Name in the legacy read-tool switch, when this is a read tool. */
  readTool?: AgentToolName;
  /** Executor for write tools and any read tool needing custom shaping. */
  run: (args: Record<string, unknown>) => Promise<{ data: unknown; summary: string }>;
};

/**
 * Documents a single turn may render. A Cloudflare Worker caps subrequests per
 * invocation (50 on the free plan) and each document costs 4-18, so this keeps
 * the worst realistic turn inside the budget.
 */
export const MAX_DOCUMENTS_PER_TURN = 4;

/* ------------------------------------------------------------------ */
/* Read tools                                                           */
/* ------------------------------------------------------------------ */

const READ_TOOLS: Record<AgentToolName, AgentToolDef> = (
  [
    ["menu_summary", "orders.view", "Counts and names of live categories and dishes, with the price range."],
    ["menu_item_lookup", "orders.view", "Look up a dish by slug or name — price, availability, dietary flags."],
    ["offers_list", "orders.view", "Current enabled offers with their thresholds and values."],
    ["stock_status", "orders.view", "Stock items that are low or out, worst first."],
    ["stock_inventory", "stock.manage", "FULL stock count: every item with on-hand, threshold, unit, cost and status."],
    ["orders_metrics", "orders.view", "30-day order, revenue and customer metrics."],
    ["orders_recent", "orders.view", "The most recent orders with number, status, total, payment and item count."],
    ["crm_summary", "crm.view", "Customer totals, repeat/at-risk counts and every segment count."],
    ["crm_customers", "crm.view", "Top customers by lifetime value and the newest signups."],
    ["users_summary", "users.manage", "Total users, staff by role, and active/suspended counts."],
    ["business_settings", "orders.view", "Brand, contact and ordering configuration."],
  ] as [AgentToolName, Capability, string][]
).reduce<Record<AgentToolName, AgentToolDef>>(
  (acc, [name, capability, description]) => {
    acc[name] = {
      capability,
      mode: "read",
      readTool: name,
      spec: {
        name,
        description,
        parameters:
          name === "menu_item_lookup"
            ? { query: { type: "string", description: "Dish name or slug", required: true } }
            : {},
      },
      run: async (args) => {
        const result = await callAgentTool(name, args);
        return { data: result.data, summary: description };
      },
    };
    return acc;
  },
  {} as Record<AgentToolName, AgentToolDef>,
);

/* ------------------------------------------------------------------ */
/* Write tools                                                          */
/* ------------------------------------------------------------------ */

/**
 * Write tools map to the same tables the console edits. Each stores its
 * proposed payload in `ops_agent_actions` for approval unless auto-apply is on,
 * so nothing reaches a customer or the public menu without a human decision in
 * the default configuration.
 */
const WRITE_TOOLS: AgentToolDef[] = [
  {
    capability: "orders.manage" as Capability,
    mode: "write",
    spec: {
      name: "set_order_status",
      write: true,
      description:
        "Move an order to a new status (accepted, in_progress, prepared, out_for_delivery, finished, canceled).",
      parameters: {
        order_number: { type: "string", description: "The order number, e.g. PW-2609-1001", required: true },
        status: {
          type: "string",
          description: "Target status",
          required: true,
          enum: ["accepted", "in_progress", "prepared", "out_for_delivery", "finished", "canceled"],
        },
      },
    },
    run: async (args) => {
      const admin = tryCreateAdminSupabase();
      if (!admin) throw new Error("service role unavailable");
      const orderNumber = String(args.order_number ?? "").trim();
      const status = String(args.status ?? "").trim();
      const { data: order } = await admin
        .from("orders")
        .select("id, status")
        .eq("order_number", orderNumber)
        .maybeSingle();
      if (!order) throw new Error(`no order ${orderNumber}`);
      const { error } = await admin
        .from("orders")
        .update({ status: status as never, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw new Error(error.message);
      return { data: { orderNumber, from: order.status, to: status }, summary: `${orderNumber} → ${status}` };
    },
  },
  {
    capability: "menu.manage" as Capability,
    mode: "write",
    spec: {
      name: "set_menu_item_availability",
      write: true,
      description: "Mark a dish available or unavailable on the public menu.",
      parameters: {
        slug: { type: "string", description: "The dish slug", required: true },
        available: { type: "boolean", description: "true to sell it, false to hide it", required: true },
      },
    },
    run: async (args) => {
      const admin = tryCreateAdminSupabase();
      if (!admin) throw new Error("service role unavailable");
      const slug = String(args.slug ?? "").trim();
      const available = Boolean(args.available);
      const { error } = await admin
        .from("menu_items")
        .update({ is_available: available, updated_at: new Date().toISOString() })
        .eq("slug", slug);
      if (error) throw new Error(error.message);
      return { data: { slug, available }, summary: `${slug} ${available ? "available" : "hidden"}` };
    },
  },
  {
    capability: "menu.manage" as Capability,
    mode: "write",
    spec: {
      name: "set_menu_item_price",
      write: true,
      description: "Change a dish price in EGP.",
      parameters: {
        slug: { type: "string", description: "The dish slug", required: true },
        price: { type: "number", description: "New price in EGP", required: true },
      },
    },
    run: async (args) => {
      const admin = tryCreateAdminSupabase();
      if (!admin) throw new Error("service role unavailable");
      const slug = String(args.slug ?? "").trim();
      const price = Number(args.price);
      if (!Number.isFinite(price) || price < 0) throw new Error("price must be a positive number");
      const { data: before } = await admin.from("menu_items").select("price").eq("slug", slug).maybeSingle();
      const { error } = await admin
        .from("menu_items")
        .update({ price, updated_at: new Date().toISOString() })
        .eq("slug", slug);
      if (error) throw new Error(error.message);
      return { data: { slug, from: before?.price ?? null, to: price }, summary: `${slug} → ${price}` };
    },
  },
  {
    capability: "stock.manage" as Capability,
    mode: "write",
    spec: {
      name: "record_stock_movement",
      write: true,
      description: "Record stock in/out for an ingredient by name.",
      parameters: {
        item: { type: "string", description: "Ingredient name", required: true },
        delta: { type: "number", description: "Signed quantity change", required: true },
        note: { type: "string", description: "Reason for the movement" },
      },
    },
    run: async (args) => {
      const admin = tryCreateAdminSupabase();
      if (!admin) throw new Error("service role unavailable");
      const item = String(args.item ?? "").trim();
      const delta = Number(args.delta);
      if (!Number.isFinite(delta) || delta === 0) throw new Error("delta must be a non-zero number");
      const { data: stock } = await admin
        .from("stock_items")
        .select("id, quantity")
        .ilike("name_en", `%${item}%`)
        .maybeSingle();
      if (!stock) throw new Error(`no stock item matching ${item}`);
      const quantity = Number(stock.quantity) + delta;
      const patch: Record<string, unknown> = { quantity, updated_at: new Date().toISOString() };
      if (quantity <= 0) patch.status = "out";
      const { error } = await admin.from("stock_items").update(patch as never).eq("id", stock.id);
      if (error) throw new Error(error.message);
      return { data: { item, delta, quantity }, summary: `${item} ${delta > 0 ? "+" : ""}${delta} → ${quantity}` };
    },
  },
  {
    capability: "loyalty.manage" as Capability,
    mode: "write",
    spec: {
      name: "adjust_loyalty_points",
      write: true,
      description: "Add or remove loyalty points for a customer by phone or email.",
      parameters: {
        customer: { type: "string", description: "Customer phone or email", required: true },
        points: { type: "integer", description: "Signed points change", required: true },
        reason: { type: "string", description: "Why the adjustment is made" },
      },
    },
    run: async (args) => {
      const admin = tryCreateAdminSupabase();
      if (!admin) throw new Error("service role unavailable");
      const customer = String(args.customer ?? "").trim();
      const points = Math.trunc(Number(args.points));
      if (!Number.isFinite(points) || points === 0) throw new Error("points must be non-zero");
      // Points live in `loyalty_accounts`, and the ledger + balance update must
      // be atomic, so go through the same RPC the console uses rather than
      // writing two tables by hand.
      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .or(`phone.eq.${customer},email.eq.${customer}`)
        .maybeSingle();
      if (!profile) throw new Error(`no customer matching ${customer}`);
      const { error } = await admin.rpc("gift_loyalty_points", {
        p_user_ids: [profile.id],
        p_points: points,
        p_reason: String(args.reason ?? "Agent adjustment"),
      });
      if (error) throw new Error(error.message);
      const { data: account } = await admin
        .from("loyalty_accounts")
        .select("points_balance")
        .eq("user_id", profile.id)
        .maybeSingle();
      return {
        data: { customer, points, balance: account?.points_balance ?? null },
        summary: `${customer} ${points > 0 ? "+" : ""}${points} pts`,
      };
    },
  },
  {
    capability: "chat.manage" as Capability,
    mode: "write",
    spec: {
      name: "reply_to_customer",
      write: true,
      description: "Reply in an existing customer conversation.",
      parameters: {
        conversation_id: { type: "string", description: "The conversation id", required: true },
        body: { type: "string", description: "The message to send", required: true },
      },
    },
    run: async (args) => {
      const admin = tryCreateAdminSupabase();
      if (!admin) throw new Error("service role unavailable");
      const conversationId = String(args.conversation_id ?? "").trim();
      const body = String(args.body ?? "").trim();
      if (!body) throw new Error("body required");
      const { error } = await admin.from("messages").insert({
        conversation_id: conversationId,
        sender_kind: "staff",
        body,
      } as never);
      if (error) throw new Error(error.message);
      return { data: { conversationId, chars: body.length }, summary: `reply sent (${body.length} chars)` };
    },
  },
  {
    capability: "exports.manage" as Capability,
    mode: "write",
    spec: {
      name: "request_export",
      write: true,
      description: "Queue a CSV export of a dataset for later download.",
      parameters: {
        dataset: {
          type: "string",
          description: "Which dataset to export",
          required: true,
          enum: ["orders", "customers", "menu", "feedback", "loyalty", "stock"],
        },
        range_days: { type: "integer", description: "How many days back to include", required: true },
      },
    },
    run: async (args) => {
      // Reuse the export builder so the agent produces the exact same job the
      // Exports screen does — same dataset validation, same storage path.
      const { createExportJob } = await import("@/lib/export/create");
      const { isExportDataset } = await import("@/lib/export/build");
      const dataset = String(args.dataset ?? "").trim();
      if (!isExportDataset(dataset)) throw new Error(`unknown dataset ${dataset}`);
      const days = Math.max(1, Math.trunc(Number(args.range_days) || 30));
      const job = await createExportJob({ dataset, format: "csv", requestedBy: null });
      return {
        data: { dataset, days, id: job.id ?? null },
        summary: `${dataset} export queued (${days}d window)`,
      };
    },
  },
  {
    capability: "ai.manage" as Capability,
    // A read tool in the loop's sense: it writes a *document*, never business
    // data, so it runs immediately instead of queueing for approval. What it
    // produces is a rendered file from live queries — the same renderer the
    // Deliverables panel calls — so a chart in chat and a chart in the console
    // are the same numbers.
    mode: "read",
    spec: {
      name: "create_document",
      description:
        "Produce a document from live data and save it: a report, a statistics page with charts, a CRM or users or inventory report, a presentation deck, or a written plan. Returns the document title and row count; the file appears in Admin -> AI ops -> Deliverables. Pass `format` to deliver it as a real file: a PDF, a Word document (.docx) or an Excel workbook (.xlsx); omit it for the default page/markdown.",
      parameters: {
        kind: {
          type: "string",
          description: "Which document to produce",
          required: true,
          enum: [
            "daily_sales",
            "weekly_kpi",
            "menu_engineering",
            "stock_reorder",
            "winback_draft",
            "pricing_review",
            "eod_reconciliation",
            "sales_dashboard",
            "crm_summary",
            "users_report",
            "inventory_report",
            "slide_deck",
            "strategy_brief",
          ],
        },
        format: {
          type: "string",
          description:
            "Optional file format: pdf, docx (Word) or xlsx (Excel). Omit for the default HTML/markdown document.",
          enum: ["pdf", "docx", "xlsx"],
        },
      },
    },
    run: async (args) => {
      const { createDeliverable, exportDeliverable, isDeliverableKind, isOfficeFormat } =
        await import("@/lib/agent/deliverables");
      const { takeToken } = await import("@/lib/request-scope");
      const kind = String(args.kind ?? "").trim();
      if (!isDeliverableKind(kind)) throw new Error(`unknown document kind ${kind}`);

      // A Worker invocation has a hard subrequest cap, and rendering a document
      // re-queries the dashboard. Cap the documents per turn so an ambitious
      // request ("make me ten reports") degrades to an honest refusal instead of
      // being killed mid-render, which leaves the artifact stuck in `building`.
      if (!takeToken("create_document", MAX_DOCUMENTS_PER_TURN)) {
        throw new Error(
          `This turn already produced ${MAX_DOCUMENTS_PER_TURN} documents. Ask again for the next one.`,
        );
      }

      const format = String(args.format ?? "").trim().toLowerCase();
      if (format) {
        if (!isOfficeFormat(format)) throw new Error(`unknown document format ${format}`);
        const result = await exportDeliverable({ kind, format, createdBy: null });
        return {
          data: { kind, format, id: result.id, title: result.title, bytes: result.bytes },
          summary: `${result.title} (.${format}, ${Math.round(result.bytes / 1024)} KB)`,
        };
      }

      const result = await createDeliverable({ kind, createdBy: null });
      return {
        data: { kind, id: result.id, title: result.title, rowCount: result.rowCount },
        summary: `${result.title} (${result.rowCount} rows)`,
      };
    },
  },
];

/**
 * The full registry, keyed by tool name. Built once at module load; the
 * per-request capability filter happens in `toolsForRole`.
 */
export const AGENT_TOOLS: Record<string, AgentToolDef> = {
  ...READ_TOOLS,
  ...Object.fromEntries(WRITE_TOOLS.map((tool) => [tool.spec.name, tool])),
};

/** Tools an actor holding these capabilities may see and call. */
export function toolsForCapabilities(capabilities: readonly Capability[]): AgentToolDef[] {
  return Object.values(AGENT_TOOLS).filter((tool) => capabilities.includes(tool.capability));
}

/**
 * Splits a tool set into what the model is told. Write tools are still offered
 * (so the agent can propose them) but flagged, and the loop routes them through
 * the confirmation policy rather than executing silently.
 */
export function specsForCapabilities(capabilities: readonly Capability[]): ToolSpec[] {
  return toolsForCapabilities(capabilities).map((tool) => tool.spec);
}
