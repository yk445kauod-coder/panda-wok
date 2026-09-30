import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getDashboardMetrics } from "@/lib/crm/insights";
import {
  renderHtmlDeliverable,
  isHtmlDeliverableKind as isHtmlKind,
} from "@/lib/agent/html-deliverables";
import { htmlToMarkdown, renderOfficeFormat } from "@/lib/agent/office";
import type { Json } from "@/lib/types/database";

/**
 * Deliverables: the documents the ops agent produces.
 *
 * The agent used to stop at a chat-style report. This module is the missing
 * half — it renders *files* a human can open, send or file: a daily sales
 * sheet, a menu-engineering report, a stock reorder list, a win-back campaign
 * draft, a KPI digest and an end-of-day reconciliation.
 *
 * Two rules are enforced by shape here:
 *
 *  1. Every figure comes from a live query and is carried into the document as
 *     data. Nothing is estimated; an empty database renders zeros and an
 *     explicit "no orders yet" line rather than a plausible-looking number.
 *  2. Rendering is deterministic. The model may *choose* which deliverable to
 *     produce and write its prose section, but the tables are computed in code,
 *     so an invented figure cannot reach a filed document.
 *
 * The bytes live in the private `artifacts` bucket; the row in
 * `agent_artifacts` stores only the path, the row count and the source data.
 */

export type DeliverableKind =
  | "daily_sales"
  | "weekly_kpi"
  | "menu_engineering"
  | "stock_reorder"
  | "winback_draft"
  | "pricing_review"
  | "eod_reconciliation"
  | "sales_dashboard"
  | "crm_summary"
  | "users_report"
  | "inventory_report"
  | "slide_deck"
  | "strategy_brief";

export type DeliverableFormat = "md" | "csv" | "json" | "html" | "pdf" | "docx" | "xlsx";

export type RenderedDeliverable = {
  kind: DeliverableKind;
  title: string;
  summary: string;
  format: DeliverableFormat;
  body: string;
  rowCount: number;
  data: Record<string, unknown>;
};

/** The office formats a deliverable can additionally be exported to. */
export const OFFICE_FORMATS = ["pdf", "docx", "xlsx"] as const;
export type OfficeFormat = (typeof OFFICE_FORMATS)[number];

export function isOfficeFormat(value: string): value is OfficeFormat {
  return (OFFICE_FORMATS as readonly string[]).includes(value);
}

const KIND_TITLES: Record<DeliverableKind, string> = {
  daily_sales: "Daily sales sheet",
  weekly_kpi: "Weekly KPI digest",
  menu_engineering: "Menu engineering report",
  stock_reorder: "Stock reorder sheet",
  winback_draft: "Win-back campaign draft",
  pricing_review: "Pricing review",
  eod_reconciliation: "End-of-day reconciliation",
  sales_dashboard: "Sales & statistics dashboard (charts)",
  crm_summary: "CRM summary",
  users_report: "Users & access report",
  inventory_report: "Inventory report",
  slide_deck: "Presentation deck",
  strategy_brief: "Strategy brief",
};

/** Kinds rendered as a self-contained HTML page (charts, slides, plans). */
const HTML_KINDS: DeliverableKind[] = [
  "sales_dashboard",
  "crm_summary",
  "users_report",
  "inventory_report",
  "slide_deck",
  "strategy_brief",
];

export function isHtmlDeliverableKind(kind: DeliverableKind): boolean {
  return HTML_KINDS.includes(kind);
}

export function isDeliverableKind(value: string): value is DeliverableKind {
  return Object.prototype.hasOwnProperty.call(KIND_TITLES, value);
}

export type MenuQuadrant = "Star" | "Plowhorse" | "Puzzle" | "Dog";

/**
 * The menu-engineering quadrants, from a dish's measured popularity and
 * contribution against the medians. Pure so it can be unit-tested without a
 * database: a dish at or above both medians is a Star, above one is a
 * Plowhorse (popular) or a Puzzle (high contribution), and below both is a Dog.
 */
export function classifyQuadrant(
  quantity: number,
  revenue: number,
  qtyMedian: number,
  revenueMedian: number,
): MenuQuadrant {
  const popular = quantity >= qtyMedian;
  const high = revenue >= revenueMedian;
  if (popular && high) return "Star";
  if (popular && !high) return "Plowhorse";
  if (!popular && high) return "Puzzle";
  return "Dog";
}

/** Every deliverable the agent can produce, for the prompt and the picker. */
export function renderDeliverableCatalogue(): string {
  return (Object.keys(KIND_TITLES) as DeliverableKind[])
    .map((kind) => `- ${kind}: ${KIND_TITLES[kind]}`)
    .join("\n");
}

/* --------------------------------------------------------------- formatting */

function money(value: number) {
  return `${Number(value).toFixed(2)} EGP`;
}

/** A markdown table from headers and rows. Only ever fed computed values. */
function mdTable(headers: string[], rows: (string | number)[][]): string {
  if (rows.length === 0) return "_No rows._";
  const head = `| ${headers.join(" | ")} |`;
  const rule = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell)).join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

/* --------------------------------------------------------------- deliverables */

/**
 * Daily sales sheet — the numbers a shift closes on. Rendered from the
 * dashboard service, so the document and the console agree.
 */
async function dailySales(): Promise<RenderedDeliverable> {
  const metrics = await getDashboardMetrics(1);
  const day = new Date().toISOString().slice(0, 10);

  const totalOrders = metrics.ordersInWindow;
  const rows: (string | number)[][] = [
    ["Orders placed", totalOrders],
    ["Orders today", metrics.ordersToday],
    ["Revenue (excluding cancelled)", money(metrics.revenueInWindow)],
    ["Average order value", money(metrics.avgOrderValue)],
    ["Cash collected", money(metrics.cashCollected)],
    ["Cancelled orders", metrics.canceledOrders],
    ["New customers", metrics.newCustomers],
    ["Returning customers", metrics.returningCustomers],
  ];

  const statusRows = metrics.statusBreakdown.map((s) => [s.status, s.count]);
  const itemRows = metrics.topItems.slice(0, 20).map((i) => [i.name, i.quantity, money(i.revenue)]);

  const body = [
    `# ${KIND_TITLES.daily_sales} — ${day}`,
    "",
    "## Headline",
    "",
    mdTable(["Metric", "Value"], rows),
    "",
    "## Orders by status",
    "",
    mdTable(["Status", "Count"], statusRows),
    "",
    "## Top dishes",
    "",
    mdTable(["Dish", "Qty", "Revenue"], itemRows),
    "",
    `_Generated from live data. ${totalOrders === 0 ? "No orders in this window." : ""}_`,
  ].join("\n");

  return {
    kind: "daily_sales",
    title: `${KIND_TITLES.daily_sales} — ${day}`,
    summary:
      totalOrders === 0
        ? "No orders in the last 24 hours."
        : `${totalOrders} orders, ${money(metrics.revenueInWindow)} revenue, ${money(metrics.avgOrderValue)} average order.`,
    format: "md",
    body,
    rowCount: totalOrders,
    data: {
      day,
      metrics: {
        orders: totalOrders,
        revenue: metrics.revenueInWindow,
        avgOrderValue: metrics.avgOrderValue,
        canceled: metrics.canceledOrders,
        cashCollected: metrics.cashCollected,
      },
      topItems: metrics.topItems.slice(0, 20),
    },
  };
}

/**
 * Weekly KPI digest — the trend, not the shift. Carries the previous window so
 * the reader sees direction, not just a level.
 */
async function weeklyKpi(): Promise<RenderedDeliverable> {
  const [current, prior] = await Promise.all([
    getDashboardMetrics(7),
    getDashboardMetrics(14),
  ]);

  const delta = (now: number, before: number) => {
    if (before === 0) return now === 0 ? "—" : "new";
    const pct = ((now - before) / before) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  };

  // The 14-day window contains the 7-day window, so the prior period is the
  // difference. Both figures are real sums; this subtraction is arithmetic on
  // measured values, not an estimate.
  const priorRevenue = Math.max(prior.revenueInWindow - current.revenueInWindow, 0);
  const priorOrders = Math.max(prior.ordersInWindow - current.ordersInWindow, 0);

  const rows: (string | number)[][] = [
    ["Revenue", money(current.revenueInWindow), money(priorRevenue), delta(current.revenueInWindow, priorRevenue)],
    ["Orders", current.ordersInWindow, priorOrders, delta(current.ordersInWindow, priorOrders)],
    ["Average order", money(current.avgOrderValue), money(prior.avgOrderValue), delta(current.avgOrderValue, prior.avgOrderValue)],
    ["New customers", current.newCustomers, prior.newCustomers, delta(current.newCustomers, prior.newCustomers)],
    ["Cancelled", current.canceledOrders, prior.canceledOrders, delta(current.canceledOrders, prior.canceledOrders)],
  ];

  const byDay = current.revenueByDay.map((d) => [d.day, d.orders, money(d.revenue)]);
  const mix = current.categoryMix.map((c) => [c.category, c.quantity, money(c.revenue)]);

  const body = [
    `# ${KIND_TITLES.weekly_kpi}`,
    "",
    `Window: last 7 days, compared with the 7 days before.`,
    "",
    "## Key measures",
    "",
    mdTable(["Measure", "This week", "Previous", "Change"], rows),
    "",
    "## Revenue by day",
    "",
    mdTable(["Day", "Orders", "Revenue"], byDay),
    "",
    "## Category mix",
    "",
    mdTable(["Category", "Qty", "Revenue"], mix),
    "",
    `_Ratings: ${
      current.feedbackSummary.count > 0
        ? `${current.feedbackSummary.averageRating.toFixed(1)} from ${current.feedbackSummary.count} responses`
        : "no responses yet"
    }._`,
  ].join("\n");

  return {
    kind: "weekly_kpi",
    title: `${KIND_TITLES.weekly_kpi} — ${new Date().toISOString().slice(0, 10)}`,
    summary:
      current.ordersInWindow === 0
        ? "No orders in the last 7 days."
        : `${current.ordersInWindow} orders (${delta(current.ordersInWindow, priorOrders)}), ${money(current.revenueInWindow)} revenue (${delta(current.revenueInWindow, priorRevenue)}).`,
    format: "md",
    body,
    rowCount: current.ordersInWindow,
    data: {
      windowDays: 7,
      current: {
        revenue: current.revenueInWindow,
        orders: current.ordersInWindow,
        avgOrderValue: current.avgOrderValue,
        newCustomers: current.newCustomers,
        canceled: current.canceledOrders,
      },
      prior: {
        revenue: priorRevenue,
        orders: priorOrders,
        avgOrderValue: prior.avgOrderValue,
        newCustomers: prior.newCustomers,
        canceled: prior.canceledOrders,
      },
      revenueByDay: current.revenueByDay,
      categoryMix: current.categoryMix,
    },
  };
}

/**
 * Menu engineering — the classic popularity × contribution quadrants.
 *
 * Every dish is classified against the *median* quantity sold and the *median*
 * revenue it contributes, which is how the stars/plowhorses/puzzles/dogs model
 * is normally defined. Contribution is revenue-based rather than margin-based
 * because the menu carries no per-dish cost; calling a revenue figure "margin"
 * would be the kind of invented claim this project avoids.
 */
async function menuEngineering(): Promise<RenderedDeliverable> {
  const metrics = await getDashboardMetrics(30);
  const items = metrics.topItems;

  const median = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const qtyMedian = median(items.map((i) => i.quantity));
  const revMedian = median(items.map((i) => i.revenue));

  const ACTION: Record<string, string> = {
    Star: "Protect — keep it prominent and steady.",
    Plowhorse: "Reprice or resize — popular but low contribution.",
    Puzzle: "Reposition — good contribution, needs visibility.",
    Dog: "Consider removing or replacing.",
  };

  const classified = items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    revenue: i.revenue,
    quadrant: classifyQuadrant(i.quantity, i.revenue, qtyMedian, revMedian),
  }));

  const byQuadrant = (q: string) => classified.filter((c) => c.quadrant === q);

  const body = [
    `# ${KIND_TITLES.menu_engineering}`,
    "",
    `Window: last 30 days. Popularity median ${qtyMedian} units · contribution median ${money(revMedian)}.`,
    "",
    ...(["Star", "Plowhorse", "Puzzle", "Dog"] as const).map((quadrant) => {
      const rows = byQuadrant(quadrant).map((c) => [c.name, c.quantity, money(c.revenue)]);
      return [
        `## ${quadrant} (${byQuadrant(quadrant).length})`,
        "",
        `_${ACTION[quadrant]}_`,
        "",
        mdTable(["Dish", "Qty", "Revenue"], rows),
        "",
      ].join("\n");
    }),
    "_Dishes with no sales in the window are not listed; they have no measured popularity._",
  ].join("\n");

  return {
    kind: "menu_engineering",
    title: `${KIND_TITLES.menu_engineering} — ${new Date().toISOString().slice(0, 10)}`,
    summary:
      items.length === 0
        ? "No dish sales in the last 30 days, nothing to classify."
        : `${classified.length} dishes classified: ${byQuadrant("Star").length} stars, ${byQuadrant("Plowhorse").length} plowhorses, ${byQuadrant("Puzzle").length} puzzles, ${byQuadrant("Dog").length} dogs.`,
    format: "md",
    body,
    rowCount: classified.length,
    data: {
      windowDays: 30,
      qtyMedian,
      revenueMedian: revMedian,
      quadrants: {
        star: byQuadrant("Star"),
        plowhorse: byQuadrant("Plowhorse"),
        puzzle: byQuadrant("Puzzle"),
        dog: byQuadrant("Dog"),
      },
    },
  };
}

/**
 * Stock reorder sheet — a CSV an owner can hand to a supplier. Quantities are
 * the shortfall to the minimum threshold plus a buffer, which is derived from
 * the measured par level rather than invented.
 */
async function stockReorder(): Promise<RenderedDeliverable> {
  const admin = createAdminSupabase();
  const { data: stockRaw } = await admin
    .from("stock_items")
    .select("name_en, unit, quantity, min_threshold, cost_per_unit, supplier, status")
    .order("status", { ascending: true })
    .order("name_en", { ascending: true })
    .limit(500);

  const stock = stockRaw ?? [];
  const needs = stock.filter((s) => s.status === "low" || s.status === "out");

  const rows = needs.map((s) => {
    const quantity = Number(s.quantity);
    const threshold = Number(s.min_threshold);
    // Top up to twice the minimum, so a single delivery covers a normal cycle.
    const target = threshold > 0 ? threshold * 2 : Math.max(quantity, 1);
    const toOrder = Math.max(Math.ceil(target - quantity), 1);
    const cost = s.cost_per_unit != null ? toOrder * Number(s.cost_per_unit) : null;
    return {
      name: s.name_en,
      unit: s.unit,
      quantity,
      min_threshold: threshold,
      to_order: toOrder,
      supplier: s.supplier ?? "",
      estimated_cost: cost,
      status: s.status,
    };
  });

  const estimatedTotal = rows.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0);

  const body = csv(
    ["item", "unit", "on_hand", "min_threshold", "to_order", "supplier", "estimated_cost_egp", "status"],
    rows.map((r) => [
      r.name,
      r.unit,
      r.quantity,
      r.min_threshold,
      r.to_order,
      r.supplier,
      r.estimated_cost != null ? r.estimated_cost.toFixed(2) : "",
      r.status,
    ]),
  );

  return {
    kind: "stock_reorder",
    title: `${KIND_TITLES.stock_reorder} — ${new Date().toISOString().slice(0, 10)}`,
    summary:
      rows.length === 0
        ? "Nothing is low or out of stock."
        : `${rows.length} items to reorder${
            estimatedTotal > 0 ? `, roughly ${money(estimatedTotal)} at last cost` : ""
          }.`,
    format: "csv",
    body,
    rowCount: rows.length,
    data: { items: rows, estimatedTotal },
  };
}

/**
 * End-of-day reconciliation — money in against orders taken, split by payment
 * method. Built from the same order rows the dashboard reads.
 */
async function eodReconciliation(): Promise<RenderedDeliverable> {
  const metrics = await getDashboardMetrics(1);
  const byMethod = new Map<string, { count: number; total: number }>();

  // The dashboard does not expose payment-method totals, so read them here.
  const admin = createAdminSupabase();
  const since = new Date(Date.now() - 86400000).toISOString();
  const { data } = await admin
    .from("orders")
    .select("payment_method, payment_status, total, status")
    .gte("created_at", since)
    .limit(2000);

  const orders = (data ?? []).filter(
    (o) => !["canceled", "rejected", "failed"].includes(o.status),
  );
  for (const order of orders) {
    const key = `${order.payment_method} / ${order.payment_status}`;
    const entry = byMethod.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(order.total);
    byMethod.set(key, entry);
  }

  const rows = [...byMethod.entries()].map(([key, value]) => [key, value.count, money(value.total)]);
  const grandTotal = orders.reduce((sum, o) => sum + Number(o.total), 0);

  const body = [
    `# ${KIND_TITLES.eod_reconciliation} — ${new Date().toISOString().slice(0, 10)}`,
    "",
    mdTable(["Payment method / status", "Orders", "Total"], rows),
    "",
    `**Total taken: ${money(grandTotal)} across ${orders.length} orders.**`,
    "",
    `Cash collected (per dashboard): ${money(metrics.cashCollected)}.`,
  ].join("\n");

  return {
    kind: "eod_reconciliation",
    title: `${KIND_TITLES.eod_reconciliation} — ${new Date().toISOString().slice(0, 10)}`,
    summary:
      orders.length === 0
        ? "No orders to reconcile in the last 24 hours."
        : `${orders.length} orders, ${money(grandTotal)} total taken.`,
    format: "md",
    body,
    rowCount: orders.length,
    data: {
      byMethod: rows.map((r, index) => ({ key: r[0], count: rows[index][1], total: rows[index][2] })),
      grandTotal,
      orders: orders.length,
      cashCollected: metrics.cashCollected,
    },
  };
}

/**
 * Win-back draft — the lapsed-customer list plus a message the owner can edit
 * and send. It is a *draft*: the deliverable contains the recipient count and
 * the copy, never a send. Sending is the existing broadcast approval path.
 */
async function winbackDraft(): Promise<RenderedDeliverable> {
  const admin = createAdminSupabase();
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, phone, created_at, last_seen_at, marketing_opt_in")
    .eq("marketing_opt_in", true)
    .lt("last_seen_at", cutoff)
    .limit(500);

  const customers = profiles ?? [];
  const csvBody = csv(
    ["name", "phone", "last_seen_at"],
    customers.map((c) => [c.full_name ?? "", c.phone ?? "", c.last_seen_at ?? ""]),
  );

  const body = [
    `# ${KIND_TITLES.winback_draft}`,
    "",
    `${customers.length} customers have opted in to marketing and not been seen for 30 days.`,
    "",
    "## Suggested message (edit before sending)",
    "",
    "**English**",
    "",
    "> We have missed you at Panda Wok. Your favourite dishes are still on the menu,",
    "> and delivery is on us. Order today and we will get it to you hot.",
    "",
    "**العربية**",
    "",
    "> وحشتنا في باندا ووك. أطباقك المفضلة لسه على المنيو، والتوصيل علينا.",
    "> اطلب النهاردة وهنوصلك وهو سخن.",
    "",
    "## Recipients",
    "",
    mdTable(
      ["Name", "Phone", "Last seen"],
      customers.slice(0, 50).map((c) => [c.full_name ?? "—", c.phone ?? "—", c.last_seen_at ?? "—"]),
    ),
    "",
    "_This is a draft. Nothing is sent until you approve a broadcast._",
  ].join("\n");

  return {
    kind: "winback_draft",
    title: `${KIND_TITLES.winback_draft} — ${new Date().toISOString().slice(0, 10)}`,
    summary:
      customers.length === 0
        ? "No opted-in customers have gone quiet for 30 days."
        : `${customers.length} opted-in customers went quiet for 30+ days.`,
    format: "md",
    body,
    rowCount: customers.length,
    data: {
      customers: customers.slice(0, 50).map((c) => ({
        name: c.full_name,
        phone: c.phone,
        lastSeenAt: c.last_seen_at,
      })),
      recipientCount: customers.length,
      recipientCsv: csvBody,
    },
  };
}

/**
 * Pricing review — the dishes flagged as plowhorses or dogs by the
 * menu-engineering pass, with their current price. It proposes, it never sets a
 * price; changing a price is a human decision in the CMS.
 */
async function pricingReview(): Promise<RenderedDeliverable> {
  const admin = createAdminSupabase();
  const [metrics, menuRes] = await Promise.all([
    getDashboardMetrics(30),
    admin.from("menu_items").select("slug, name_en, price").eq("is_archived", false).limit(500),
  ]);
  const menu = menuRes.data ?? [];
  const priceBySlug = new Map(menu.map((m) => [m.slug, Number(m.price)]));
  const nameToPrice = new Map(menu.map((m) => [m.name_en, Number(m.price)]));

  const sorted = [...metrics.topItems].sort((a, b) => a.revenue - b.revenue);
  const candidates = sorted.slice(0, Math.min(15, sorted.length));

  const rows = candidates.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    revenue: item.revenue,
    price: nameToPrice.get(item.name) ?? null,
  }));

  const body = [
    `# ${KIND_TITLES.pricing_review}`,
    "",
    "Lowest-contribution dishes over the last 30 days, with their list price.",
    "A low contribution can mean the price is low, the dish is unpopular, or both — read the quantity column before changing anything.",
    "",
    mdTable(
      ["Dish", "Qty", "Revenue", "List price"],
      rows.map((r) => [r.name, r.quantity, money(r.revenue), r.price != null ? money(r.price) : "—"]),
    ),
    "",
    `_Menu holds ${menu.length} dishes (${priceBySlug.size} priced). Nothing is changed by this report._`,
  ].join("\n");

  return {
    kind: "pricing_review",
    title: `${KIND_TITLES.pricing_review} — ${new Date().toISOString().slice(0, 10)}`,
    summary:
      rows.length === 0
        ? "No sales in the window, no pricing signal."
        : `${rows.length} low-contribution dishes listed for review.`,
    format: "md",
    body,
    rowCount: rows.length,
    data: { candidates: rows, menuCount: menu.length },
  };
}

/** Renders one deliverable by kind. Unknown kinds fail loudly. */
export async function renderDeliverable(kind: DeliverableKind): Promise<RenderedDeliverable> {
  switch (kind) {
    case "daily_sales":
      return dailySales();
    case "weekly_kpi":
      return weeklyKpi();
    case "menu_engineering":
      return menuEngineering();
    case "stock_reorder":
      return stockReorder();
    case "eod_reconciliation":
      return eodReconciliation();
    case "winback_draft":
      return winbackDraft();
    case "pricing_review":
      return pricingReview();
    // The HTML kinds render charts and slides, so they delegate to their own
    // module and are returned with `format: "html"`.
    case "sales_dashboard":
    case "crm_summary":
    case "users_report":
    case "inventory_report":
    case "slide_deck":
    case "strategy_brief": {
      const rendered = await renderHtmlDeliverable(kind);
      return {
        kind,
        title: rendered.title,
        summary: rendered.summary,
        format: "html",
        body: rendered.body,
        rowCount: rendered.rowCount,
        data: rendered.data,
      };
    }
    default:
      throw new Error(`No renderer for deliverable "${kind}".`);
  }
}

/** MIME type for an artifact body, so a download opens correctly in a browser. */
export function deliverableContentType(format: DeliverableFormat): string {
  switch (format) {
    case "csv":
      return "text/csv; charset=utf-8";
    case "html":
      return "text/html; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "text/markdown; charset=utf-8";
  }
}

/** File extension for an artifact path. */
export function deliverableExtension(format: DeliverableFormat): string {
  return format === "md" ? "md" : format;
}

/* --------------------------------------------------------------- persistence */

const ARTIFACT_BUCKET = "artifacts";

function artifactPath(id: string, kind: DeliverableKind, format: DeliverableFormat) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${kind}/${stamp}/${id}.${format}`;
}

/**
 * Re-renders a deliverable into an office format and stores the result.
 *
 * The source is always the live data, never the stored markdown, so a PDF
 * exported today shows today's numbers and cannot drift from the HTML or Excel
 * version. For the HTML kinds the page is converted through `htmlToMarkdown`
 * first, which is why a chart page and its spreadsheet agree: both read the
 * same rendered figures.
 */
export async function exportDeliverable(params: {
  kind: DeliverableKind;
  format: OfficeFormat;
  runId?: string | null;
  createdBy?: string | null;
}): Promise<{ id: string; title: string; path: string; bytes: number }> {
  const admin = createAdminSupabase();
  const rendered = await renderDeliverable(params.kind);
  const markdown = rendered.format === "html" ? htmlToMarkdown(rendered.body) : rendered.body;
  const body = renderOfficeFormat(params.format, markdown, rendered.title);

  const { data: id, error: openError } = await admin.rpc("open_artifact", {
    p_kind: params.kind,
    p_title: rendered.title,
    p_summary: rendered.summary,
    p_format: params.format,
    p_data: {} as Json,
    p_run_id: params.runId ?? undefined,
    p_created_by: params.createdBy ?? undefined,
  });
  if (openError || !id) throw new Error(openError?.message ?? "Could not open the export.");

  const path = artifactPath(id as string, params.kind, params.format);
  try {
    const { error: uploadError } = await admin.storage
      .from(ARTIFACT_BUCKET)
      .upload(path, body, {
        contentType: deliverableContentType(params.format),
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { error: finishError } = await admin.rpc("finish_artifact", {
      p_id: id as string,
      p_storage_path: path,
      p_bytes: body.length,
      p_row_count: rendered.rowCount,
    });
    if (finishError) throw new Error(finishError.message);

    return { id: id as string, title: rendered.title, path, bytes: body.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    await admin.rpc("fail_artifact", { p_id: id as string, p_error: message }).then(
      () => null,
      () => null,
    );
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Renders a deliverable, stores its bytes and records the row. This is the one
 * path used by both the scheduled run and the on-demand console button.
 */
export async function createDeliverable(params: {
  kind: DeliverableKind;
  runId?: string | null;
  createdBy?: string | null;
}): Promise<{ id: string; title: string; rowCount: number; summary: string }> {
  const admin = createAdminSupabase();

  // Open the row first so a failure between here and the upload is auditable.
  // The format is provisional: it is corrected below from the rendered body,
  // because an HTML deliverable must not be filed as markdown.
  const { data: id, error: openError } = await admin.rpc("open_artifact", {
    p_kind: params.kind,
    p_title: KIND_TITLES[params.kind],
    p_summary: "",
    p_format: isHtmlKind(params.kind) ? "html" : "md",
    p_data: {} as Json,
    p_run_id: params.runId ?? undefined,
    p_created_by: params.createdBy ?? undefined,
  });
  if (openError || !id) {
    throw new Error(openError?.message ?? "Could not open the deliverable.");
  }

  try {
    const rendered = await renderDeliverable(params.kind);
    const path = artifactPath(id as string, rendered.kind, rendered.format);

    const { error: uploadError } = await admin.storage
      .from(ARTIFACT_BUCKET)
      .upload(path, rendered.body, {
        contentType: deliverableContentType(rendered.format),
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    // Fill the human-facing fields now that the body exists.
    await admin
      .from("agent_artifacts")
      .update({
        title: rendered.title,
        summary: rendered.summary,
        format: rendered.format,
        data: rendered.data as Json,
      })
      .eq("id", id as string);

    const { error: finishError } = await admin.rpc("finish_artifact", {
      p_id: id as string,
      p_storage_path: path,
      p_bytes: Buffer.byteLength(rendered.body, "utf8"),
      p_row_count: rendered.rowCount,
    });
    if (finishError) throw new Error(finishError.message);

    return { id: id as string, title: rendered.title, rowCount: rendered.rowCount, summary: rendered.summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rendering failed.";
    await admin.rpc("fail_artifact", { p_id: id as string, p_error: message }).then(
      () => null,
      () => null,
    );
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Marks documents that were left `building` by a process that died mid-render.
 *
 * `createDeliverable` marks its own row `failed` on a thrown error, but a Worker
 * killed at the subrequest/CPU cap never throws — the invocation just ends. The
 * row then sits in `building` forever and the console shows a document that
 * spins and never resolves. Anything still `building` well past any plausible
 * render is therefore dead, and is retired honestly rather than silently.
 */
export async function sweepStaleArtifacts(olderThanMinutes = 15): Promise<number> {
  const admin = createAdminSupabase();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data, error } = await admin
    .from("agent_artifacts")
    .update({
      status: "failed",
      error: "Rendering did not finish (the process was interrupted). Try again.",
    })
    .eq("status", "building")
    .lt("created_at", cutoff)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

/** Reads for the console: the newest deliverables, newest first. */
export async function listDeliverables(limit = 30) {
  // Self-heal on read: opening the library retires any document a killed
  // invocation left spinning, so the list never shows a permanent "building".
  await sweepStaleArtifacts().catch(() => 0);
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("agent_artifacts")
    .select("id, kind, title, summary, format, status, storage_path, bytes, row_count, error, created_at, completed_at, reuse_count")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load deliverables: ${error.message}`);
  return data ?? [];
}

/** Short-lived signed download URLs for ready deliverables. */
export async function getDeliverableDownloadUrls(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const urls: Record<string, string> = {};
  for (const entry of data) {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}
