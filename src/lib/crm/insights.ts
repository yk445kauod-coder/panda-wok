import "server-only";

import { tryCreateAdminSupabase } from "@/lib/supabase/server";
import {
  ADMIN_AGGREGATE_REVALIDATE,
  cachedAdminAggregate,
} from "@/lib/cache/admin-aggregate";
import { memo } from "@/lib/request-scope";

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
  feedbackSummary: {
    count: number;
    averageRating: number;
    distribution: { rating: number; count: number }[];
    openCount: number;
  };
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/**
 * Cross-request cache for the folded aggregates. The computation walks the whole
 * window in JavaScript — the CPU that Error 1102 kills — and is identical for
 * every viewer, so a few seconds of sharing removes it from all but the first
 * request. `memo` still dedupes within one request (a run + its report), and the
 * cached layer dedupes across requests.
 */
const cachedDashboardMetrics = cachedAdminAggregate(
  loadDashboardMetrics,
  ["admin-dashboard-metrics"],
  { revalidate: ADMIN_AGGREGATE_REVALIDATE },
);

/**
 * All dashboard numbers are computed from real rows. Nothing is estimated or
 * seeded, and an empty database yields zeros rather than invented figures.
 */
export async function getDashboardMetrics(days = 30): Promise<DashboardMetrics> {
  return memo(`dashboard-metrics:${days}`, () => cachedDashboardMetrics(days));
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
    feedbackSummary: { count: 0, averageRating: 0, distribution: [], openCount: 0 },
  };

  if (!admin) return empty;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const windowStart = new Date(Date.now() - days * 86400000);

  const [ordersRes, itemsRes, feedbackRes, profilesRes] =
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
        .from("feedback")
        .select("rating, status")
        .gte("created_at", windowStart.toISOString())
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
    feedbackSummary: {
      count: feedbackRows.length,
      averageRating,
      distribution: [...ratingDistribution.entries()]
        .map(([rating, count]) => ({ rating, count }))
        .sort((a, b) => b.rating - a.rating),
      openCount: feedbackRows.filter((f) => f.status === "new").length,
    },
  };
}
