import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export type AdminOrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  delivery_fee: number;
  created_at: string;
  fulfillment: Database["public"]["Enums"]["fulfillment_type"];
  payment_method: Database["public"]["Enums"]["payment_method"];
  payment_status: Database["public"]["Enums"]["payment_status"];
  customer_note: string | null;
  address_snapshot: Database["public"]["Tables"]["orders"]["Row"]["address_snapshot"];
  user_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  item_count: number;
  items_summary: string | null;
};

export type AdminOrderItem = Database["public"]["Tables"]["order_items"]["Row"];

export type AdminOrderDetail = AdminOrderRow & {
  items: AdminOrderItem[];
  history: Database["public"]["Tables"]["order_status_history"]["Row"][];
};

const ADMIN_ORDER_COLUMNS =
  "id, order_number, status, total, subtotal, delivery_fee, created_at, fulfillment, payment_method, payment_status, customer_note, address_snapshot, user_id, order_items (id, name_snapshot, quantity), profiles (full_name, phone)";

type RawAdminOrder = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  delivery_fee: number;
  created_at: string;
  fulfillment: Database["public"]["Enums"]["fulfillment_type"];
  payment_method: Database["public"]["Enums"]["payment_method"];
  payment_status: Database["public"]["Enums"]["payment_status"];
  customer_note: string | null;
  address_snapshot: Database["public"]["Tables"]["orders"]["Row"]["address_snapshot"];
  user_id: string;
  order_items?: { id: string; name_snapshot: string; quantity: number }[];
  profiles?: { full_name: string | null; phone: string | null } | null;
};

function shapeOrder(row: RawAdminOrder): AdminOrderRow {
  const items = row.order_items ?? [];
  const summary = items
    .slice(0, 3)
    .map((item) => `${item.quantity}× ${item.name_snapshot}`)
    .join(", ");

  return {
    id: row.id,
    order_number: row.order_number,
    status: row.status,
    total: Number(row.total),
    subtotal: Number(row.subtotal),
    delivery_fee: Number(row.delivery_fee),
    created_at: row.created_at,
    fulfillment: row.fulfillment,
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    customer_note: row.customer_note,
    address_snapshot: row.address_snapshot,
    user_id: row.user_id,
    customer_name: row.profiles?.full_name ?? null,
    customer_phone: row.profiles?.phone ?? null,
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    items_summary:
      items.length > 3 ? `${summary} +${items.length - 3} more` : summary || null,
  };
}

/** Staff order queue. RLS limits these rows to staff sessions. */
export async function listAdminOrders(params: {
  status?: OrderStatus | "active" | "all";
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<AdminOrderRow[]> {
  const supabase = await createServerSupabase();

  let query = supabase
    .from("orders")
    .select(ADMIN_ORDER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 100);

  if (params.status && params.status !== "all") {
    if (params.status === "active") {
      query = query.in("status", [
        "new",
        "accepted",
        "in_progress",
        "prepared",
        "out_for_delivery",
      ]);
    } else {
      query = query.eq("status", params.status);
    }
  }

  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", params.to);
  if (params.search) query = query.ilike("order_number", `%${params.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return ((data ?? []) as unknown as RawAdminOrder[]).map(shapeOrder);
}

export async function getAdminOrder(id: string): Promise<AdminOrderDetail | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `${ADMIN_ORDER_COLUMNS}, order_items (*), order_status_history (id, order_id, from_status, to_status, changed_by, changed_by_role, note, created_at)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the order: ${error.message}`);
  if (!data) return null;

  const raw = data as unknown as RawAdminOrder & {
    order_items?: AdminOrderItem[];
    order_status_history?: Database["public"]["Tables"]["order_status_history"]["Row"][];
  };

  const shaped = shapeOrder(raw);
  return {
    ...shaped,
    items: raw.order_items ?? [],
    history: (raw.order_status_history ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ),
  };
}

/** Counts per status for the queue tabs, computed in one round trip. */
export async function getOrderStatusCounts(): Promise<
  Record<string, number> & { active: number; all: number }
> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .gte("created_at", new Date(Date.now() - 60 * 86400000).toISOString());

  if (error) throw new Error(`Failed to count orders: ${error.message}`);

  const counts: Record<string, number> = { all: 0, active: 0 };
  const activeStatuses = new Set([
    "new",
    "accepted",
    "in_progress",
    "prepared",
    "out_for_delivery",
  ]);

  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    counts.all += 1;
    if (activeStatuses.has(row.status)) counts.active += 1;
  }

  return counts as Record<string, number> & { active: number; all: number };
}

/** Kitchen board: the active queue grouped so staff can work top-down. */
export async function getKitchenQueue(): Promise<{
  fresh: AdminOrderRow[];
  cooking: AdminOrderRow[];
  ready: AdminOrderRow[];
  dispatching: AdminOrderRow[];
}> {
  const orders = await listAdminOrders({ status: "active", limit: 200 });

  return {
    fresh: orders.filter((o) => o.status === "new" || o.status === "accepted"),
    cooking: orders.filter((o) => o.status === "in_progress"),
    ready: orders.filter((o) => o.status === "prepared"),
    dispatching: orders.filter((o) => o.status === "out_for_delivery"),
  };
}
