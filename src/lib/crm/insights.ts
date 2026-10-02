import "server-only";

import { createAdminSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import {
  buildDbProviderChain,
  loadDbProviders,
  getWorkersAiBinding,
  runCompletion,
  type CompletionRequest,
} from "@/lib/ai/provider";
import { recordAiRequest } from "@/lib/ai/usage";
import { memo } from "@/lib/request-scope";
import type { Database } from "@/lib/types/database";

export type DashboardMetrics = {
  windowDays: number;
  ordersToday: number;
  ordersInWindow: number;
  revenueInWindow: number;
  avgOrderValue: number;
  newCustomers: number;
  returningCustomers: number;
  canceledOrders: number;
  cashCollected: number;
  statusBreakdown: { status: string; count: number }[];
  revenueByDay: { day: string; revenue: number; orders: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
  categoryMix: { category: string; quantity: number; revenue: number }[];
  stockWarnings: {
    id: string;
    name: string;
    quantity: number;
    min_threshold: number;
    unit: string;
    status: string;
  }[];
  feedbackSummary: {
    count: number;
    averageRating: number;
    distribution: { rating: number; count: number }[];
    openCount: number;
  };
  loyalty: {
    members: number;
    pointsOutstanding: number;
    activeTiers: { tier: string; count: number }[];
  };
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/**
 * All dashboard numbers are computed from real rows. Nothing is estimated or
 * seeded, and an empty database yields zeros rather than invented figures.
 */
export async function getDashboardMetrics(days = 30): Promise<DashboardMetrics> {
  return memo(`dashboard-metrics:${days}`, () => loadDashboardMetrics(days));
}

async function loadDashboardMetrics(days: number): Promise<DashboardMetrics> {
  const admin = tryCreateAdminSupabase();
  const empty: DashboardMetrics = {
    windowDays: days,
    ordersToday: 0,
    ordersInWindow: 0,
    revenueInWindow: 0,
    avgOrderValue: 0,
    newCustomers: 0,
    returningCustomers: 0,
    canceledOrders: 0,
    cashCollected: 0,
    statusBreakdown: [],
    revenueByDay: [],
    topItems: [],
    categoryMix: [],
    stockWarnings: [],
    feedbackSummary: { count: 0, averageRating: 0, distribution: [], openCount: 0 },
    loyalty: { members: 0, pointsOutstanding: 0, activeTiers: [] },
  };

  if (!admin) return empty;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const windowStart = new Date(Date.now() - days * 86400000);

  const [ordersRes, itemsRes, stockRes, feedbackRes, loyaltyRes, profilesRes] =
    await Promise.all([
      admin
        .from("orders")
        .select("id, status, total, created_at, user_id, payment_status")
        .gte("created_at", windowStart.toISOString())
        .limit(2000),
      admin
        .from("order_items")
        .select("name_snapshot, quantity, line_total, order_id, menu_item_id, orders!inner (created_at, status)")
        .gte("orders.created_at", windowStart.toISOString())
        .limit(5000),
      admin
        .from("stock_items")
        .select("id, name_en, quantity, min_threshold, unit, status")
        .in("status", ["low", "out"])
        .order("status", { ascending: true })
        .limit(200),
      admin
        .from("feedback")
        .select("rating, status")
        .gte("created_at", windowStart.toISOString())
        .limit(2000),
      admin
        .from("loyalty_accounts")
        .select("tier, points_balance, lifetime_points")
        .limit(2000),
      admin
        .from("profiles")
        .select("id, created_at")
        .gte("created_at", windowStart.toISOString())
        .limit(2000),
    ]);

  const orders = ordersRes.data ?? [];
  const validOrders = orders.filter(
    (o) => !["canceled", "rejected", "failed"].includes(o.status),
  );
  const finished = orders.filter((o) => o.status === "finished");

  const revenue = finished.reduce((sum, o) => sum + Number(o.total), 0);

  const statusCounts = new Map<string, number>();
  for (const order of orders) {
    statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
  }

  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (const order of validOrders) {
    const key = dayKey(order.created_at);
    const bucket = byDay.get(key) ?? { revenue: 0, orders: 0 };
    bucket.orders += 1;
    if (order.status === "finished") bucket.revenue += Number(order.total);
    byDay.set(key, bucket);
  }

  const revenueByDay = [...byDay.entries()]
    .map(([day, v]) => ({ day, revenue: Math.round(v.revenue * 100) / 100, orders: v.orders }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const items = itemsRes.data ?? [];
  const validItems = items.filter(
    (i) =>
      i.orders &&
      !["canceled", "rejected", "failed"].includes(
        (i.orders as unknown as { status: string }).status,
      ),
  );

  const itemAgg = new Map<string, { quantity: number; revenue: number }>();
  for (const item of validItems) {
    const bucket = itemAgg.get(item.name_snapshot) ?? { quantity: 0, revenue: 0 };
    bucket.quantity += item.quantity;
    bucket.revenue += Number(item.line_total);
    itemAgg.set(item.name_snapshot, bucket);
  }
  const topItems = [...itemAgg.entries()]
    .map(([name, v]) => ({ name, quantity: v.quantity, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const menuItemIds = [
    ...new Set(validItems.map((i) => i.menu_item_id).filter(Boolean)),
  ] as string[];
  const categoryByItem = new Map<string, string>();
  if (menuItemIds.length > 0) {
    const { data: menuRows } = await admin
      .from("menu_items")
      .select("id, categories (name_en)")
      .in("id", menuItemIds);
    for (const row of menuRows ?? []) {
      const cat = row.categories as unknown as { name_en: string } | null;
      categoryByItem.set(row.id, cat?.name_en ?? "Uncategorised");
    }
  }

  const catAgg = new Map<string, { quantity: number; revenue: number }>();
  for (const item of validItems) {
    const name = item.menu_item_id
      ? categoryByItem.get(item.menu_item_id) ?? "Uncategorised"
      : "Uncategorised";
    const bucket = catAgg.get(name) ?? { quantity: 0, revenue: 0 };
    bucket.quantity += item.quantity;
    bucket.revenue += Number(item.line_total);
    catAgg.set(name, bucket);
  }
  const categoryMix = [...catAgg.entries()]
    .map(([category, v]) => ({
      category,
      quantity: v.quantity,
      revenue: Math.round(v.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const customerIds = validOrders.map((o) => o.user_id);
  const customerOrderCounts = new Map<string, number>();
  for (const id of customerIds) {
    customerOrderCounts.set(id, (customerOrderCounts.get(id) ?? 0) + 1);
  }
  const newCustomerIds = new Set((profilesRes.data ?? []).map((p) => p.id));
  const orderingCustomers = [...customerOrderCounts.keys()];
  const newCustomers = orderingCustomers.filter((id) => newCustomerIds.has(id)).length;
  const returningCustomers = orderingCustomers.length - newCustomers;

  const feedbackRows = feedbackRes.data ?? [];
  const ratingDistribution = new Map<number, number>();
  for (const row of feedbackRows) {
    ratingDistribution.set(row.rating, (ratingDistribution.get(row.rating) ?? 0) + 1);
  }
  const averageRating =
    feedbackRows.length > 0
      ? Math.round(
          (feedbackRows.reduce((s, r) => s + r.rating, 0) / feedbackRows.length) * 10,
        ) / 10
      : 0;

  const loyaltyRows = loyaltyRes.data ?? [];
  const tierCounts = new Map<string, number>();
  for (const row of loyaltyRows) {
    tierCounts.set(row.tier, (tierCounts.get(row.tier) ?? 0) + 1);
  }

  return {
    windowDays: days,
    ordersToday: orders.filter((o) => new Date(o.created_at) >= startOfToday).length,
    ordersInWindow: validOrders.length,
    revenueInWindow: Math.round(revenue * 100) / 100,
    avgOrderValue:
      finished.length > 0 ? Math.round((revenue / finished.length) * 100) / 100 : 0,
    newCustomers,
    returningCustomers,
    canceledOrders: orders.filter((o) =>
      ["canceled", "rejected", "failed"].includes(o.status),
    ).length,
    cashCollected: Math.round(
      finished
        .filter((o) => o.payment_status === "paid" || o.payment_status === "unpaid")
        .reduce((sum, o) => sum + Number(o.total), 0) * 100,
    ) / 100,
    statusBreakdown: [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    revenueByDay,
    topItems,
    categoryMix,
    stockWarnings: (stockRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name_en,
      quantity: Number(s.quantity),
      min_threshold: Number(s.min_threshold),
      unit: s.unit,
      status: s.status,
    })),
    feedbackSummary: {
      count: feedbackRows.length,
      averageRating,
      distribution: [...ratingDistribution.entries()]
        .map(([rating, count]) => ({ rating, count }))
        .sort((a, b) => b.rating - a.rating),
      openCount: feedbackRows.filter((f) => f.status === "new").length,
    },
    loyalty: {
      members: loyaltyRows.length,
      pointsOutstanding: loyaltyRows.reduce((s, r) => s + r.points_balance, 0),
      activeTiers: [...tierCounts.entries()]
        .map(([tier, count]) => ({ tier, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}

// ---------------------------------------------------------------------------
// AI CRM insights
// ---------------------------------------------------------------------------

export type InsightRecommendation = {
  /**
   * Stable machine id, independent of the wording. Titles are localised (the
   * console is Arabic-first), so tests and callers key off this instead of
   * matching a translated string.
   */
  key: InsightKey;
  title: string;
  observation: string;
  evidence: string[];
  suggestedAction: string;
  confidence: "low" | "medium" | "high";
  confidenceReason: string;
  source: "data" | "ai";
};

export type InsightKey =
  | "thin_history"
  | "frequent_pairing"
  | "falling_demand"
  | "growing_demand"
  | "stock_out"
  | "stock_tight"
  | "lapsed_customers"
  | "rating_below_target"
  | "menu_breadth"
  | "category_concentration";

export type InsightsReport = {
  generatedAt: string;
  windowDays: number;
  provider: string;
  model: string;
  status: "ok" | "fallback";
  error: string | null;
  deterministic: InsightRecommendation[];
  aiNarrative: string | null;
  /** The full raw snapshot the findings were built from — same numbers only the
   * wording is produced here — so the admin page can chart them directly. */
  data: InsightData;
};

export type InsightData = {
  windowDays: number;
  totals: { orders: number; revenue: number; avgOrderValue: number; canceled: number };
  pairs: { a: string; b: string; count: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
  weakItems: { name: string; quantity: number; revenue: number }[];
  itemTrend: { name: string; recentQty: number; priorQty: number }[];
  inactiveCustomers: { count: number; avgDaysSinceOrder: number | null };
  loyalty: { members: number; pointsOutstanding: number; lapsedMembers: number };
  feedback: { count: number; averageRating: number; negativeThemes: string[] };
  stockDemand: { item: string; quantity: number; stockName: string | null; stockQty: number | null; unit: string | null }[];
  categoryMix: { category: string; quantity: number; revenue: number }[];
  /** Visual aggregates so the page can chart the raw window without extra queries. */
  statusMix?: { status: string; count: number }[];
  revenueByDay?: { day: string; revenue: number; orders: number }[];
  feedbackDist?: { rating: number; count: number }[];
};

/**
 * Gathers the exact figures the insight layer is allowed to reference. This is
 * the only data handed to the model, so every AI claim is traceable to a row.
 */
export async function collectInsightData(days = 30): Promise<InsightData> {
  return memo(`insight-data:${days}`, () => loadInsightData(days));
}

async function loadInsightData(days: number): Promise<InsightData> {
  const admin = createAdminSupabase();
  const since = new Date(Date.now() - days * 86400000);
  const priorStart = new Date(Date.now() - days * 2 * 86400000);

  const { data: orders } = await admin
    .from("orders")
    .select("id, status, total, created_at, user_id")
    .gte("created_at", priorStart.toISOString());

  const rows = orders ?? [];
  const recent = rows.filter((o) => new Date(o.created_at) >= since);
  const prior = rows.filter((o) => new Date(o.created_at) < since);
  const validRecent = recent.filter(
    (o) => !["canceled", "rejected", "failed"].includes(o.status),
  );
  const finishedRecent = validRecent.filter((o) => o.status === "finished");

  const recentIds = validRecent.map((o) => o.id);
  const priorIds = prior
    .filter((o) => !["canceled", "rejected", "failed"].includes(o.status))
    .map((o) => o.id);

  const fetchItems = async (ids: string[]) =>
    ids.length === 0
      ? []
      : (
          await admin
            .from("order_items")
            .select("order_id, name_snapshot, quantity, line_total, menu_item_id")
            .in("order_id", ids.slice(0, 3000))
        ).data ?? [];

  const [recentItems, priorItems] = await Promise.all([
    fetchItems(recentIds),
    fetchItems(priorIds),
  ]);

  // Basket co-occurrence, to surface genuinely frequent pairings.
  const byOrder = new Map<string, string[]>();
  for (const item of recentItems) {
    const list = byOrder.get(item.order_id) ?? [];
    list.push(item.name_snapshot);
    byOrder.set(item.order_id, list);
  }
  const pairCounts = new Map<string, number>();
  for (const names of byOrder.values()) {
    const unique = [...new Set(names)].sort();
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const key = `${unique[i]} + ${unique[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const pairs = [...pairCounts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split(" + ");
      return { a, b, count };
    })
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const agg = (items: typeof recentItems) => {
    const map = new Map<string, { quantity: number; revenue: number }>();
    for (const item of items) {
      const bucket = map.get(item.name_snapshot) ?? { quantity: 0, revenue: 0 };
      bucket.quantity += item.quantity;
      bucket.revenue += Number(item.line_total);
      map.set(item.name_snapshot, bucket);
    }
    return map;
  };

  const recentAgg = agg(recentItems);
  const priorAgg = agg(priorItems);

  const allItems = [...recentAgg.entries()]
    .map(([name, v]) => ({ name, quantity: v.quantity, revenue: Math.round(v.revenue) }))
    .sort((a, b) => b.quantity - a.quantity);

  const itemTrend = allItems.map((item) => ({
    name: item.name,
    recentQty: item.quantity,
    priorQty: priorAgg.get(item.name)?.quantity ?? 0,
  }));

  const soldNames = allItems.map((i) => i.name);

  const customerOrders = new Map<string, string[]>();
  for (const order of validRecent) {
    const list = customerOrders.get(order.user_id) ?? [];
    list.push(order.created_at);
    customerOrders.set(order.user_id, list);
  }
  const allCustomerIds = [...customerOrders.keys()];

  const { data: allOrdersByCustomer } =
    allCustomerIds.length > 0
      ? await admin
          .from("orders")
          .select("user_id, created_at, status")
          .in("user_id", allCustomerIds.slice(0, 2000))
      : { data: [] };

  const lastOrderByCustomer = new Map<string, string>();
  for (const order of allOrdersByCustomer ?? []) {
    if (["canceled", "rejected", "failed"].includes(order.status)) continue;
    const existing = lastOrderByCustomer.get(order.user_id);
    if (!existing || order.created_at > existing) {
      lastOrderByCustomer.set(order.user_id, order.created_at);
    }
  }

  const inactiveCustomerIds = [...lastOrderByCustomer.entries()].filter(
    ([, last]) => (Date.now() - new Date(last).getTime()) / 86400000 > 30,
  );
  const avgDaysSinceOrder =
    inactiveCustomerIds.length > 0
      ? Math.round(
          inactiveCustomerIds.reduce(
            (sum, [, last]) =>
              sum + (Date.now() - new Date(last).getTime()) / 86400000,
            0,
          ) / inactiveCustomerIds.length,
        )
      : null;

  const { data: loyaltyRows } = await admin
    .from("loyalty_accounts")
    .select("user_id, points_balance, tier");

  const loyaltyMembers = loyaltyRows ?? [];

  const { data: feedbackRows } = await admin
    .from("feedback")
    .select("rating, message, category")
    .gte("created_at", since.toISOString());

  const negative = (feedbackRows ?? []).filter((f) => f.rating <= 2);
  const themeCounts = new Map<string, number>();
  for (const row of negative) {
    themeCounts.set(row.category, (themeCounts.get(row.category) ?? 0) + 1);
  }

  // Link best-selling dishes to the stock they consume.
  const { data: stockLinks } = await admin
    .from("menu_item_stock")
    .select("quantity_per_unit, menu_items!inner (name_en), stock_items!inner (name_en, quantity, unit)");

  const stockDemand = allItems.slice(0, 10).map((item) => {
    const link = (stockLinks ?? []).find(
      (l) =>
        (l.menu_items as unknown as { name_en: string }).name_en === item.name,
    );
    if (!link) {
      return { item: item.name, quantity: item.quantity, stockName: null, stockQty: null, unit: null };
    }
    const stock = link.stock_items as unknown as {
      name_en: string;
      quantity: number;
      unit: string;
    };
    return {
      item: item.name,
      quantity: item.quantity,
      stockName: stock.name_en,
      stockQty: Number(stock.quantity),
      unit: stock.unit,
    };
  });

  const categoryMixMap = new Map<string, { quantity: number; revenue: number }>();
  const menuIds = [...new Set(recentItems.map((i) => i.menu_item_id).filter(Boolean))] as string[];
  if (menuIds.length > 0) {
    const { data: menuRows } = await admin
      .from("menu_items")
      .select("id, categories (name_en)")
      .in("id", menuIds);
    const catByItem = new Map(
      (menuRows ?? []).map((r) => [
        r.id,
        (r.categories as unknown as { name_en: string } | null)?.name_en ?? "Uncategorised",
      ]),
    );
    for (const item of recentItems) {
      const name = item.menu_item_id
        ? catByItem.get(item.menu_item_id) ?? "Uncategorised"
        : "Uncategorised";
      const bucket = categoryMixMap.get(name) ?? { quantity: 0, revenue: 0 };
      bucket.quantity += item.quantity;
      bucket.revenue += Number(item.line_total);
      categoryMixMap.set(name, bucket);
    }
  }

  return {
    windowDays: days,
    totals: {
      orders: validRecent.length,
      revenue: Math.round(finishedRecent.reduce((s, o) => s + Number(o.total), 0) * 100) / 100,
      avgOrderValue:
        finishedRecent.length > 0
          ? Math.round(
              (finishedRecent.reduce((s, o) => s + Number(o.total), 0) /
                finishedRecent.length) *
                100,
            ) / 100
          : 0,
      canceled: recent.filter((o) =>
        ["canceled", "rejected", "failed"].includes(o.status),
      ).length,
    },
    pairs,
    topItems: allItems.slice(0, 8),
    weakItems: [...allItems].sort((a, b) => a.quantity - b.quantity).slice(0, 5),
    itemTrend,
    inactiveCustomers: {
      count: inactiveCustomerIds.length,
      avgDaysSinceOrder,
    },
    loyalty: {
      members: loyaltyMembers.length,
      pointsOutstanding: loyaltyMembers.reduce((s, r) => s + r.points_balance, 0),
      lapsedMembers: loyaltyMembers.filter((m) =>
        inactiveCustomerIds.some(([id]) => id === m.user_id),
      ).length,
    },
    feedback: {
      count: (feedbackRows ?? []).length,
      averageRating:
        (feedbackRows ?? []).length > 0
          ? Math.round(
              ((feedbackRows ?? []).reduce((s, f) => s + f.rating, 0) /
                (feedbackRows ?? []).length) *
                10,
            ) / 10
          : 0,
      negativeThemes: [...themeCounts.entries()].map(([theme, count]) => `${theme}: ${count}`),
    },
    stockDemand,
    categoryMix: [...categoryMixMap.entries()]
      .map(([category, v]) => ({
        category,
        quantity: v.quantity,
        revenue: Math.round(v.revenue * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    // Visual aggregates computed from the same window rows the findings cite,
    // so the charts and the cards can never disagree. Status mix counts every
    // order in the window (including un-finished), exactly as `totals.canceled`
    // does; revenue by day splits finished revenue per UTC day.
    statusMix: [...recent.reduce((map, o) => {
      const bucket = map.get(o.status) ?? { status: o.status, count: 0 };
      bucket.count += 1;
      map.set(o.status, bucket);
      return map;
    }, new Map<string, { status: string; count: number }>()).values()],
    revenueByDay: [...finishedRecent.reduce((map, o) => {
      const day = o.created_at.slice(0, 10);
      const bucket = map.get(day) ?? { day, revenue: 0, orders: 0 };
      bucket.revenue += Number(o.total);
      bucket.orders += 1;
      map.set(day, bucket);
      return map;
    }, new Map<string, { day: string; revenue: number; orders: number }>()).values()]
      .map((b) => ({ ...b, revenue: Math.round(b.revenue * 100) / 100 }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    feedbackDist:
      [...(feedbackRows ?? []).reduce((map,f) => {
        const bucket = map.get(f.rating) ?? { rating: f.rating, count: 0 };
        bucket.count += 1;
        map.set(f.rating, bucket);
        return map;
      }, new Map<number, { rating: number; count: number }>()).values()].sort((a, b) => a.rating - b.rating),
    soldNames,
  } as InsightData & { soldNames: string[] };
}

function renderInsightContext(data: InsightData): string {
  const lines: string[] = [];
  lines.push(`Window: last ${data.windowDays} days.`);
  lines.push(
    `Orders: ${data.totals.orders}. Finished revenue: ${data.totals.revenue} EGP. Average order value: ${data.totals.avgOrderValue} EGP. Canceled/rejected/failed: ${data.totals.canceled}.`,
  );
  lines.push("");
  lines.push("Top items by quantity (name | qty | revenue EGP):");
  for (const item of data.topItems) {
    lines.push(`  ${item.name} | ${item.quantity} | ${item.revenue}`);
  }
  lines.push("");
  lines.push("Lowest-selling items in the same window:");
  for (const item of data.weakItems) {
    lines.push(`  ${item.name} | ${item.quantity} | ${item.revenue}`);
  }
  lines.push("");
  lines.push("Items with quantity change vs the previous equal window:");
  for (const trend of data.itemTrend) {
    const delta = trend.recentQty - trend.priorQty;
    lines.push(
      `  ${trend.name}: now ${trend.recentQty}, previously ${trend.priorQty} (change ${delta >= 0 ? "+" : ""}${delta})`,
    );
  }
  lines.push("");
  if (data.pairs.length > 0) {
    lines.push("Items appearing together in the same order (pair | orders):");
    for (const pair of data.pairs) {
      lines.push(`  ${pair.a} + ${pair.b} | ${pair.count}`);
    }
  } else {
    lines.push("No repeated item pairings were observed in this window.");
  }
  lines.push("");
  lines.push(
    `Customers whose last order was more than 30 days ago: ${data.inactiveCustomers.count}${data.inactiveCustomers.avgDaysSinceOrder !== null ? `, averaging ${data.inactiveCustomers.avgDaysSinceOrder} days since their last order` : ""}.`,
  );
  lines.push(
    `Loyalty members: ${data.loyalty.members}. Points outstanding: ${data.loyalty.pointsOutstanding}. Of those, lapsed members: ${data.loyalty.lapsedMembers}.`,
  );
  lines.push("Category performance (category | qty | revenue EGP):");
  for (const row of data.categoryMix) {
    lines.push(`  ${row.category} | ${row.quantity} | ${row.revenue}`);
  }
  lines.push(
    `Feedback: ${data.feedback.count} responses, average rating ${data.feedback.averageRating}/5.`,
  );
  if (data.feedback.negativeThemes.length > 0) {
    lines.push(`Low-rating themes (1–2 stars): ${data.feedback.negativeThemes.join(", ")}`);
  }
  lines.push("");
  lines.push("Best sellers and the stock they consume:");
  for (const row of data.stockDemand) {
    if (row.stockName) {
      lines.push(
        `  ${row.item}: ${row.quantity} sold; depends on ${row.stockName}, currently ${row.stockQty} ${row.unit} on hand`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * Generates actionable insights. The deterministic pass always produces
 * grounded findings; the model, when configured, only adds narrative on top of
 * the same figures and is explicitly barred from inventing metrics.
 */
export async function generateInsights(params: {
  days?: number;
  systemInstruction: string;
  actorId: string | null;
}): Promise<InsightsReport> {
  const days = params.days ?? 30;
  const data = await collectInsightData(days);
  const deterministic = buildDeterministicInsights(data);
  const context = renderInsightContext(data);

  const [providers, binding] = await Promise.all([loadDbProviders(), getWorkersAiBinding()]);
  const chain = await buildDbProviderChain({ rows: providers, binding }, () => context);
  const request: CompletionRequest = {
    messages: [
      { role: "system", content: params.systemInstruction },
      {
        role: "user",
        content: `البيانات\n----\n${context}\n----\n\nاكتب ملاحظاتك دلوقتي بالمصري.`,
      },
    ],
    temperature: 0.25,
    maxTokens: 900,
  };

  let run;
  try {
    run = await runCompletion(chain, request);
  } catch (error) {
    run = {
      text: "",
      provider: "deterministic",
      model: "menu-grounded-rules",
      promptTokens: null,
      completionTokens: null,
      estimatedCost: 0,
      status: "fallback" as const,
      latencyMs: 0,
      error: error instanceof Error ? error.message : "insight generation failed",
    };
  }

  await recordAiRequest({
    userId: params.actorId,
    surface: "crm_insights",
    promptKey: "crm_insights",
    provider: run.provider,
    model: run.model,
    latencyMs: run.latencyMs,
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
    estimatedCost: run.estimatedCost,
    status: run.error ? "error" : run.status,
    error: run.error,
    // Only the deterministic floor sets this on success, and it is a genuine
    // chain-wide failure ("insight generation failed"). A remote fallback that
    // answered is `error: null` with the tripped providers in `providerErrors`.
    providerErrors: run.providerErrors,
  });

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    deterministic,
    aiNarrative: run.provider === "deterministic" ? null : run.text,
    data,
  };
}

/**
 * The deterministic pass. It always runs, needs no model, and every sentence is
 * Egyptian Arabic — the console is Arabic-first, and these findings are what a
 * staff member reads when the model is unavailable. Numbers and dish names are
 * interpolated as-is (never invented); only the wording is localised.
 */
export function buildDeterministicInsights(data: InsightData): InsightRecommendation[] {
  const out: InsightRecommendation[] = [];
  const money = (n: number) => `${n} ج.م`;

  if (data.totals.orders < 5) {
    out.push({
      key: "thin_history",
      title: "لسه مفيش تاريخ طلبات كفاية",
      observation: `في آخر ${data.windowDays} يوم اتسجّل ${data.totals.orders} طلب بس (بدون الملغية).`,
      evidence: [
        `عدد الطلبات في المدة: ${data.totals.orders}`,
        `إيراد الطلبات المكتملة: ${money(data.totals.revenue)}`,
      ],
      suggestedAction:
        "خد النتايج اللي تحت على سبيل الاسترشاد بس، ورجعلها تاني لما تبقى عندك 30 لـ 50 طلب في المدة.",
      confidence: "low",
      confidenceReason: "العيّنة صغيرة، والنسب بتتغير كتير مع عدد طلبات قليل.",
      source: "data",
    });
  }

  if (data.pairs.length > 0) {
    const best = data.pairs[0];
    out.push({
      key: "frequent_pairing",
      title: `الطلب المتكرر مع بعض: ${best.a} مع ${best.b}`,
      observation: `الاتنين اتطلبوا في نفس الأوردر ${best.count} مرة في آخر ${data.windowDays} يوم.`,
      evidence: data.pairs
        .slice(0, 4)
        .map((p) => `${p.a} + ${p.b}: ${p.count} طلب`),
      suggestedAction: `اعرض ${best.b} كإضافة بضغطة واحدة لما ${best.a} يبقى في السلة، وقيس إذا نسبة الإضافة زادت.`,
      confidence: best.count >= 10 ? "high" : best.count >= 5 ? "medium" : "low",
      confidenceReason: `مبني على ${best.count} مرة اتطلبوا مع بعض؛ طلبات أكتر هتخلي الربط أوضح.`,
      source: "data",
    });
  }

  const declined = data.itemTrend
    .filter((i) => i.priorQty >= 5 && i.recentQty < i.priorQty * 0.6)
    .sort((a, b) => a.recentQty - b.recentQty)[0];

  if (declined) {
    out.push({
      key: "falling_demand",
      title: `الطلب بينزل: ${declined.name}`,
      observation: `الكمية المبيعة نزلت من ${declined.priorQty} في المدة اللي قبلها لـ ${declined.recentQty} دلوقتي.`,
      evidence: [
        `الكمية في المدة السابقة: ${declined.priorQty}`,
        `الكمية في المدة الحالية: ${declined.recentQty}`,
      ],
      suggestedAction: `اتأكد إذا ${declined.name} كان كتير نفدت كميته أو كان مخفي، وبعدها فكّر في عرض لفترة قصيرة أو تغيير مكانه في صفحة المنيو.`,
      confidence: "medium",
      confidenceReason:
        "في مدتين متقارنتين، بس الموسم وتوقف المخزون مش مفصولين هنا.",
      source: "data",
    });
  }

  const rising = data.itemTrend
    .filter((i) => i.recentQty >= 5 && i.recentQty > i.priorQty * 1.5)
    .sort((a, b) => b.recentQty - a.recentQty)[0];

  if (rising) {
    out.push({
      key: "growing_demand",
      title: `الطلب بيزيد: ${rising.name}`,
      observation: `الكمية المبيعة طلعت من ${rising.priorQty} لـ ${rising.recentQty} بين المدتين.`,
      evidence: [
        `الكمية في المدة السابقة: ${rising.priorQty}`,
        `الكمية في المدة الحالية: ${rising.recentQty}`,
      ],
      suggestedAction: `خلي عندك مخزون كفاية من ${rising.name} وفكّر تديه مكان مميز في المنيو.`,
      confidence: "medium",
      confidenceReason: "الطلب بيزيد في البيانات، بس السبب لسه مش واضح.",
      source: "data",
    });
  }

  const riskyStock = data.stockDemand.filter(
    (row) => row.stockQty !== null && row.stockQty <= 0,
  );
  if (riskyStock.length > 0) {
    out.push({
      key: "stock_out",
      title: "أصناف مطلوبة ومخزونها صفر",
      observation: `${riskyStock.length} من الأصناف الأكثر مبيعًا معتمدة على خامة مخزونها دلوقتي صفر.`,
      evidence: riskyStock.map(
        (row) => `${row.item} (اتباع ${row.quantity}) معتمد على ${row.stockName}: ${row.stockQty} ${row.unit}`,
      ),
      suggestedAction:
        "اتّبّع الخامات دي أو اعلن الأصناف اللي متأثرة كغير متاحة عشان العميل ميطالبش بحاجة المطبخ مش قادر يعملها.",
      confidence: "high",
      confidenceReason: "كمية المخزون وربطها بالأصناف مقروءة مباشرة من الصفوف الحالية.",
      source: "data",
    });
  } else {
    const tight = data.stockDemand.filter(
      (row) => row.stockQty !== null && row.stockQty > 0 && row.stockQty <= 3,
    );
    if (tight.length > 0) {
      out.push({
        key: "stock_tight",
        title: "المخزون قرب يخلص على خطوط مطلوبة",
        observation: `${tight.length} خامة وراء أصناف مطلوبة باقي فيها 3 وحدات أو أقل.`,
        evidence: tight.map(
          (row) => `${row.stockName}: ${row.stockQty} ${row.unit} (بتُستخدم في ${row.item})`,
        ),
        suggestedAction: "اطلبها تاني قبل الخدمة الجاية عشان متبيعش أصناف مش هتقدر تسلّمها.",
        confidence: "high",
        confidenceReason: "قراءة مباشرة لصفوف المخزون الحالية مقابل كميات البيع.",
        source: "data",
      });
    }
  }

  if (data.inactiveCustomers.count > 0) {
    out.push({
      key: "lapsed_customers",
      title: "عملاء بقالهم فترة مبطلبوش",
      observation: `${data.inactiveCustomers.count} عميل بقالهم أكتر من 30 يوم مبطلبوش${data.inactiveCustomers.avgDaysSinceOrder !== null ? `، بمتوسط ${data.inactiveCustomers.avgDaysSinceOrder} يوم من آخر طلب` : ""}.`,
      evidence: [
        `عملاء بقالهم فترة: ${data.inactiveCustomers.count}`,
        `أعضاء ولاء بقالهم فترة: ${data.loyalty.lapsedMembers}`,
        `نقاط معلّقة: ${data.loyalty.pointsOutstanding}`,
      ],
      suggestedAction:
        "ابعت رسالة استرجاع للعملاء دول، وفكّر اللي عندهم نقاط مستخدمة إنها هتنتهي.",
      confidence: data.inactiveCustomers.count >= 10 ? "medium" : "low",
      confidenceReason: `مبني على ${data.inactiveCustomers.count} عميل؛ أسباب توقفهم مش مسجلة في البيانات.`,
      source: "data",
    });
  }

  if (data.feedback.count > 0 && data.feedback.averageRating < 4) {
    out.push({
      key: "rating_below_target",
      title: "تقييم العملاء أقل من المستهدف",
      observation: `متوسط التقييم ${data.feedback.averageRating}/5 من ${data.feedback.count} رد.`,
      evidence: [
        `متوسط التقييم: ${data.feedback.averageRating}`,
        ...data.feedback.negativeThemes.map((theme) => `سبب تقييم منخفض — ${theme}`),
      ],
      suggestedAction:
        "اقرا تقييمات النجوم القليلة حسب الأسباب اللي فوق وصلّح المشكلة بالتحديد قبل ما تتكرر.",
      confidence: data.feedback.count >= 10 ? "medium" : "low",
      confidenceReason: `في ${data.feedback.count} رد بس في المدة.`,
      source: "data",
    });
  }

  const best = data.topItems[0];
  const weakest = data.weakItems[0];
  if (best && weakest && best.name !== weakest.name && data.categoryMix.length > 1) {
    out.push({
      key: "menu_breadth",
      title: "المنيو فيه صنف قوي وصنف ضعيف",
      observation: `${best.name} اتباع ${best.quantity} وحدة، و${weakest.name} اتباع ${weakest.quantity} في نفس المدة.`,
      evidence: [
        `الأقوى: ${best.name} — ${best.quantity} وحدة، ${money(best.revenue)}`,
        `الأضعف: ${weakest.name} — ${weakest.quantity} وحدة، ${money(weakest.revenue)}`,
      ],
      suggestedAction: `فكّر تعمل عرض يجمع ${weakest.name} مع ${best.name}، أو راجع وصفه وصورته.`,
      confidence: "medium",
      confidenceReason:
        "فرق مبيعات واضح، بس السعر والمكان في المنيو وتوفر المخزون كلهم بيأثروا ومش مفصولين هنا.",
      source: "data",
    });
  }

  if (data.categoryMix.length > 0) {
    const top = data.categoryMix[0];
    // Share is measured against the same orders the mix was built from. Using
    // `totals.revenue` here was wrong twice over: that figure counts only
    // *finished* orders while the mix sums every non-cancelled one, and the
    // `Math.max(..., 1)` floor turned an empty finished-revenue window into a
    // denominator of 1 — a live run reported "about 19000% of finished revenue".
    const mixTotal = data.categoryMix.reduce((sum, c) => sum + c.revenue, 0);
    const share = mixTotal > 0 ? Math.round((top.revenue / mixTotal) * 100) : 0;
    out.push({
      key: "category_concentration",
      title: `تركيز المبيعات في قسم: ${top.category}`,
      observation: `${top.category} عمل ${money(top.revenue)}، حوالي ${share}% من إيراد الأصناف في المدة.`,
      evidence: data.categoryMix
        .slice(0, 4)
        .map((c) => `${c.category}: ${money(c.revenue)} على ${c.quantity} وحدة`),
      suggestedAction:
        share > 60
          ? "الاعتماد على قسم واحد مخاطرة. جرّب تعمل ترويج لقسم تاني عشان توازن المزيج."
          : "المزيج متوازن بشكل معقول؛ تابع لو أي قسم بدأ يسيطر.",
      confidence: "medium",
      confidenceReason: "نسبة الإيراد دقيقة للمدة دي، وممكن تتغير مع العروض.",
      source: "data",
    });
  }

  return out;
}

export type AiUsageRow = Database["public"]["Tables"]["ai_usage_daily"]["Row"];

export async function getAiUsage(days = 30): Promise<{
  daily: AiUsageRow[];
  recent: Database["public"]["Tables"]["ai_requests"]["Row"][];
  totals: {
    requests: number;
    errors: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCost: number;
    fallbackRate: number;
  };
}> {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return {
      daily: [],
      recent: [],
      totals: {
        requests: 0,
        errors: 0,
        promptTokens: 0,
        completionTokens: 0,
        estimatedCost: 0,
        fallbackRate: 0,
      },
    };
  }

  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [{ data: daily }, { data: recent }] = await Promise.all([
    admin
      .from("ai_usage_daily")
      .select("*")
      .gte("day", since.slice(0, 10))
      .order("day", { ascending: false }),
    admin
      .from("ai_requests")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const requests = (recent ?? []).length;
  const fallbacks = (recent ?? []).filter((r) => r.status === "fallback").length;

  return {
    daily: daily ?? [],
    recent: recent ?? [],
    totals: {
      requests,
      errors: (recent ?? []).filter((r) => r.status === "error").length,
      promptTokens: (recent ?? []).reduce((s, r) => s + (r.prompt_tokens ?? 0), 0),
      completionTokens: (recent ?? []).reduce((s, r) => s + (r.completion_tokens ?? 0), 0),
      estimatedCost: (recent ?? []).reduce(
        (s, r) => s + Number(r.estimated_cost ?? 0),
        0,
      ),
      fallbackRate: requests > 0 ? Math.round((fallbacks / requests) * 100) : 0,
    },
  };
}
