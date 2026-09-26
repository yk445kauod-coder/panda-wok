import "server-only";

import { createAdminSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";

export type CrmCustomer = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  last_seen_at: string | null;
  last_order_at: string | null;
  order_count: number;
  lifetime_value: number;
  avg_order_value: number;
  days_since_last_order: number | null;
  points_balance: number;
  tier: string;
  favorite_items: string[] | null;
  is_blocked: boolean;
  marketing_opt_in: boolean;
};

export type SegmentKey =
  | "all"
  | "opted_in"
  | "new"
  | "loyal"
  | "inactive"
  | "never_ordered"
  | "high_value"
  | "loyalty_members"
  | "winback";

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: "All customers",
  opted_in: "Opted into marketing",
  new: "New in the last 30 days",
  loyal: "Loyal (3+ orders)",
  inactive: "No order in N days",
  never_ordered: "Never ordered",
  high_value: "High value (spend >= N EGP)",
  loyalty_members: "Holding loyalty points",
  winback: "Lapsed 30–90 days (win-back)",
};

export const SEGMENT_VALUE_LABELS: Partial<Record<SegmentKey, string>> = {
  inactive: "Days since last order",
  high_value: "Minimum lifetime spend (EGP)",
};

/** Customer 360 list. Runs as the service role after a capability check. */
export async function listCrmCustomers(params: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<CrmCustomer[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("crm_customers", {
    ...(params.search ? { p_search: params.search } : {}),
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });

  if (error) throw new Error(`Failed to load customers: ${error.message}`);

  return (data ?? []).map((row) => ({
    ...row,
    lifetime_value: Number(row.lifetime_value),
    avg_order_value: Number(row.avg_order_value),
    order_count: Number(row.order_count),
    favorite_items: Array.isArray(row.favorite_items)
      ? (row.favorite_items as unknown as string[])
      : [],
  }));
}

/**
 * Head-count under the same filter `listCrmCustomers` uses, so a page can show
 * "x of y" and stop paging at the end of the book.
 */
export async function countCrmCustomers(search?: string): Promise<number> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return 0;

  const { data, error } = await admin.rpc("crm_customer_count", {
    ...(search ? { p_search: search } : {}),
  });
  if (error) return 0;
  return Number(data ?? 0);
}

/**
 * Whole-book CRM aggregates. Computed in SQL rather than by summing the page
 * of rows the dashboard happens to show, which made the figures depend on the
 * page size.
 */
export async function getCrmStats(): Promise<{
  customer_count: number;
  lifetime_value: number;
  repeat_customers: number;
  at_risk_customers: number;
  blocked_customers: number;
  marketing_opt_in: number;
}> {
  const admin = tryCreateAdminSupabase();
  const empty = {
    customer_count: 0,
    lifetime_value: 0,
    repeat_customers: 0,
    at_risk_customers: 0,
    blocked_customers: 0,
    marketing_opt_in: 0,
  };
  if (!admin) return empty;

  const { data, error } = await admin.rpc("crm_stats").maybeSingle();
  if (error || !data) return empty;

  return {
    customer_count: Number(data.customer_count),
    lifetime_value: Number(data.lifetime_value),
    repeat_customers: Number(data.repeat_customers),
    at_risk_customers: Number(data.at_risk_customers),
    blocked_customers: Number(data.blocked_customers),
    marketing_opt_in: Number(data.marketing_opt_in),
  };
}

export async function getCrmCustomer(userId: string): Promise<CrmCustomer | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("crm_customers", {
    p_limit: 200,
    p_offset: 0,
  });
  if (error) throw new Error(`Failed to load customers: ${error.message}`);
  const found = (data ?? []).find((row) => row.user_id === userId);
  if (!found) return null;
  return {
    ...found,
    lifetime_value: Number(found.lifetime_value),
    avg_order_value: Number(found.avg_order_value),
    order_count: Number(found.order_count),
    favorite_items: Array.isArray(found.favorite_items)
      ? (found.favorite_items as unknown as string[])
      : [],
  };
}

export async function estimateSegment(
  segment: SegmentKey,
  value = 30,
): Promise<number> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("crm_estimate_segment", {
    p_segment: segment,
    p_value: value,
  });
  if (error) throw new Error(`Failed to estimate segment: ${error.message}`);
  return data ?? 0;
}

export type SegmentBreakdown = {
  segment: SegmentKey;
  label: string;
  count: number;
};

/** Every segment with a live count, for the segments dashboard. */
export async function segmentOverview(): Promise<SegmentBreakdown[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];

  const keys: SegmentKey[] = [
    "all",
    "opted_in",
    "new",
    "loyal",
    "inactive",
    "never_ordered",
    "high_value",
    "loyalty_members",
    "winback",
  ];

  const defaults: Record<SegmentKey, number> = {
    all: 0,
    opted_in: 0,
    new: 0,
    loyal: 0,
    inactive: 30,
    never_ordered: 0,
    high_value: 1000,
    loyalty_members: 0,
    winback: 0,
  };

  const results = await Promise.all(
    keys.map(async (segment) => ({
      segment,
      label: SEGMENT_LABELS[segment],
      count: await estimateSegment(segment, defaults[segment]).catch(() => 0),
    })),
  );

  return results;
}

export type CustomerActivity = {
  id: number;
  event: string;
  entity: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
  customer_name?: string | null;
};

export async function listActivity(params: {
  userId?: string;
  event?: string;
  search?: string;
  limit?: number;
}): Promise<CustomerActivity[]> {
  const admin = createAdminSupabase();
  const limit = params.limit ?? 100;

  let query = admin
    .from("activity_logs")
    .select("id, event, entity, entity_id, metadata, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.userId) query = query.eq("user_id", params.userId);
  if (params.event) query = query.eq("event", params.event);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load activity: ${error.message}`);

  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];

  let names = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  }

  const term = params.search?.trim().toLowerCase();
  const withNames = rows.map((row) => ({
    ...row,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    customer_name: row.user_id ? names.get(row.user_id) ?? null : null,
  }));

  if (!term) return withNames;
  return withNames.filter(
    (row) =>
      row.event.toLowerCase().includes(term) ||
      (row.customer_name ?? "").toLowerCase().includes(term) ||
      JSON.stringify(row.metadata).toLowerCase().includes(term),
  );
}

export type FunnelCounts = {
  visitors: number;
  menuViewers: number;
  itemViewers: number;
  cartUsers: number;
  checkoutUsers: number;
  customers: number;
};

/**
 * Conversion funnel from analytics_events plus real orders. Each stage counts
 * distinct sessions so a refresh does not inflate the numbers.
 */
export async function getFunnel(days = 30): Promise<FunnelCounts> {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return {
      visitors: 0,
      menuViewers: 0,
      itemViewers: 0,
      cartUsers: 0,
      checkoutUsers: 0,
      customers: 0,
    };
  }

  const since = new Date(Date.now() - days * 86400000).toISOString();

  const countDistinct = async (events: string[]) => {
    const { data } = await admin
      .from("analytics_events")
      .select("session_id")
      .in("event", events)
      .gte("created_at", since);
    return new Set((data ?? []).map((r) => r.session_id)).size;
  };

  const [{ count: orderCount }] = await Promise.all([
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .not("status", "in", '("canceled","rejected","failed")'),
  ]);

  const [visitors, menuViewers, itemViewers, cartUsers, checkoutUsers] =
    await Promise.all([
      countDistinct(["PAGE_VIEW", "MENU_VIEW"]),
      countDistinct(["MENU_VIEW"]),
      countDistinct(["ITEM_VIEW"]),
      countDistinct(["CART_ADD"]),
      countDistinct(["CHECKOUT_STARTED"]),
    ]);

  return {
    visitors,
    menuViewers,
    itemViewers,
    cartUsers,
    checkoutUsers,
    customers: orderCount ?? 0,
  };
}
