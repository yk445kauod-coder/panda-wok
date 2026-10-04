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
  discount_total: number;
  delivery_fee: number;
  /** Name of the promotion applied at placement time, when one was. */
  offer_name: string | null;
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
  "id, order_number, status, total, subtotal, discount_total, delivery_fee, offer_name, created_at, fulfillment, payment_method, payment_status, customer_note, address_snapshot, user_id, order_items (id, name_snapshot, quantity, modifiers), profiles (full_name, phone)";

export type RawOrderItemModifier = {
  name?: string | null;
  name_en?: string | null;
  price_delta?: number;
};

export type RawOrderItem = {
  id: string;
  name_snapshot: string;
  quantity: number;
  modifiers?: RawOrderItemModifier[] | null;
};

type RawAdminOrder = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  offer_name: string | null;
  created_at: string;
  fulfillment: Database["public"]["Enums"]["fulfillment_type"];
  payment_method: Database["public"]["Enums"]["payment_method"];
  payment_status: Database["public"]["Enums"]["payment_status"];
  customer_note: string | null;
  address_snapshot: Database["public"]["Tables"]["orders"]["Row"]["address_snapshot"];
  user_id: string;
  order_items?: RawOrderItem[];
  profiles?: { full_name: string | null; phone: string | null } | null;
};

/**
 * The chosen options for one line, as names. `place_order` snapshots each
 * option into `order_items.modifiers` as `{ id, name, price_delta }`; this reads
 * either `name` or the older `name_en` shape so a ticket never loses the choice
 * to a naming difference in the stored JSON.
 */
export function itemOptionNames(
  modifiers: RawOrderItemModifier[] | null | undefined,
): string[] {
  if (!Array.isArray(modifiers)) return [];
  return modifiers
    .map((mod) => mod?.name ?? mod?.name_en ?? "")
    .map((name) => name.trim())
    .filter(Boolean);
}

/** One line as a cook reads it: `2× Chicken (sweet & sour sauce)`. */
export function orderItemLine(item: RawOrderItem): string {
  const options = itemOptionNames(item.modifiers);
  const base = `${item.quantity}× ${item.name_snapshot}`;
  return options.length > 0 ? `${base} (${options.join(", ")})` : base;
}

/**
 * A ticket/queue summary of the first few lines, each with its chosen options.
 * The options matter as much as the dish name here — "Chicken (sweet & sour
 * sauce)" and "Chicken (oyster sauce)" are different plates, so a summary that
 * dropped the choice would send the kitchen the wrong food.
 */
export function summariseOrderItems(items: RawOrderItem[], max = 3): string | null {
  if (items.length === 0) return null;
  const summary = items.slice(0, max).map(orderItemLine).join(", ");
  return items.length > max ? `${summary} +${items.length - max} more` : summary;
}

function shapeOrder(row: RawAdminOrder): AdminOrderRow {
  const items = row.order_items ?? [];
  const summary = summariseOrderItems(items);

  return {
    id: row.id,
    order_number: row.order_number,
    status: row.status,
    total: Number(row.total),
    subtotal: Number(row.subtotal),
    discount_total: Number(row.discount_total),
    delivery_fee: Number(row.delivery_fee),
    offer_name: row.offer_name,
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
  offset?: number;
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
  if (params.offset) query = query.range(params.offset, params.offset + (params.limit ?? 100) - 1);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return ((data ?? []) as unknown as RawAdminOrder[]).map(shapeOrder);
}

/**
 * Total row count for the current filter, so the queue can paginate. Uses a
 * head request with an exact count rather than fetching rows.
 */
export async function countAdminOrders(params: {
  status?: OrderStatus | "active" | "all";
  search?: string;
  from?: string;
  to?: string;
}): Promise<number> {
  const supabase = await createServerSupabase();

  let query = supabase.from("orders").select("id", { count: "exact", head: true });

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

  const { count, error } = await query;
  if (error) throw new Error(`Failed to count orders: ${error.message}`);
  return count ?? 0;
}

export async function getAdminOrder(id: string): Promise<AdminOrderDetail | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `${ADMIN_ORDER_COLUMNS}, order_status_history (id, order_id, from_status, to_status, changed_by, changed_by_role, note, created_at)`,
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

/**
 * Orders still sitting in the `new` stage, i.e. nobody has accepted them yet.
 * This is the set the console's order alert rings for: the siren stops the
 * moment an order leaves `new`, so the query deliberately narrows to that one
 * status rather than reusing the whole active queue.
 */
export async function getPendingNewOrders(limit = 50): Promise<OrderAlert[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load new orders: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
  }));
}

export type OrderAlert = {
  id: string;
  orderNumber: string;
  createdAt: string;
};

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
