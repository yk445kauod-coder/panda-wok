import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderStatusHistory =
  Database["public"]["Tables"]["order_status_history"]["Row"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type Address = Database["public"]["Tables"]["addresses"]["Row"];

export type OrderWithItems = Order & {
  order_items: OrderItem[];
  order_status_history: OrderStatusHistory[];
};

/**
 * Tracking view for a single order. RLS permits this only for the owner or
 * staff, so an unauthenticated guess returns null rather than leaking data.
 */
export async function getOrderForViewer(orderId: string): Promise<OrderWithItems | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "*, order_items (*, ), order_status_history (id, order_id, from_status, to_status, changed_by, changed_by_role, note, created_at)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load order: ${error.message}`);
  if (!data) return null;

  const order = data as unknown as OrderWithItems;
  return {
    ...order,
    order_items: (order.order_items ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ),
    order_status_history: (order.order_status_history ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ),
  };
}

export type OrderSummary = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  item_count: number;
  created_at: string;
  eta_minutes: number | null;
  fulfillment: Database["public"]["Enums"]["fulfillment_type"];
};

export async function getMyOrders(
  userId: string,
  limit = 20,
): Promise<OrderSummary[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, total, created_at, eta_minutes, fulfillment, order_items (quantity)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load your orders: ${error.message}`);

  return (data ?? []).map((row) => {
    const items = (row.order_items ?? []) as { quantity: number }[];
    return {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      total: Number(row.total),
      item_count: items.reduce((sum, i) => sum + (i.quantity ?? 0), 0),
      created_at: row.created_at,
      eta_minutes: row.eta_minutes,
      fulfillment: row.fulfillment,
    };
  });
}

export async function getMyAddresses(userId: string): Promise<Address[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load addresses: ${error.message}`);
  return data ?? [];
}

export async function getMyDefaultAddress(userId: string): Promise<Address | null> {
  const addresses = await getMyAddresses(userId);
  return addresses.find((a) => a.is_default) ?? addresses[0] ?? null;
}

/** Counts for the account overview, all scoped to the caller by RLS. */
export async function getMyStats(userId: string): Promise<{
  orderCount: number;
  lifetimeSpend: number;
  activeOrders: number;
}> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("status, total")
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to load account stats: ${error.message}`);

  const rows = data ?? [];
  const finished = rows.filter((r) => r.status === "finished");
  const activeStatuses: OrderStatus[] = [
    "new",
    "accepted",
    "in_progress",
    "prepared",
    "out_for_delivery",
  ];

  return {
    orderCount: rows.filter(
      (r) => !["canceled", "rejected", "failed"].includes(r.status),
    ).length,
    lifetimeSpend: finished.reduce((sum, r) => sum + Number(r.total), 0),
    activeOrders: rows.filter((r) => activeStatuses.includes(r.status)).length,
  };
}
