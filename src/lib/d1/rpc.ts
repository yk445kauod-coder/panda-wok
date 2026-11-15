/**
 * The RPC surface, ported from Postgres to TypeScript.
 *
 * Supabase's 48 functions are called as `supabase.rpc("name", args)` and the
 * caller reads `{ data, error }` back. This module keeps that contract: each
 * name maps to a handler with the same arguments and the same return shape, so
 * no call site changes. Only the functions the app actually calls are here;
 * anything missing fails loudly instead of silently returning nothing.
 *
 * `place_order` is the important one: it has to stay atomic. Everything it
 * touches runs inside a single D1 `batch`, which D1 executes as one implicit
 * transaction, so a half-written order is impossible.
 */

import { getD1Database, type D1Value } from "@/lib/d1/database";
import { fromSqlRow, newUuid, nowIso, toSqlValue } from "@/lib/d1/coerce";
import type { QueryResult } from "@/lib/d1/client";

export type RpcContext = { elevated: boolean; userId: string | null };

type Handler = (params: Record<string, unknown>, context: RpcContext) => Promise<unknown>;

/** Money is rounded to 2dp the way the Postgres `numeric(10,2)` columns did. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `PW-` + a zero-padded sequence, unique per day, as the original produced. */
async function nextOrderNumber(): Promise<string> {
  const db = getD1Database();
  const row = await db
    .prepare("SELECT count(*) AS n FROM orders WHERE created_at >= date('now')")
    .first<{ n: number }>();
  const sequence = (row?.n ?? 0) + 1;
  return `PW-${String(sequence).padStart(4, "0")}`;
}

type OrderLine = {
  menu_item_id?: string | null;
  name_snapshot?: string;
  name_ar_snapshot?: string | null;
  unit_price: number;
  quantity: number;
  modifiers?: unknown;
  notes?: string | null;
};

/**
 * `place_order(p_items, p_address, p_fulfillment, p_payment_method, ...)`.
 *
 * Steps, all in one batch: resolve the delivery fee, price the lines, apply the
 * offer, earn points, insert the order and its lines, then write the opening
 * `order_status_history` row. The order is the return value.
 */
const placeOrder: Handler = async (params, context) => {
  const db = getD1Database();
  const userId = String(params.p_user_id ?? context.userId ?? "");
  if (!userId) throw new Error("place_order: no user");

  const lines = (params.p_items ?? []) as OrderLine[];
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("place_order: no items");

  const fulfillment = String(params.p_fulfillment ?? "delivery");
  const paymentMethod = String(params.p_payment_method ?? "cash_on_delivery");
  const addressSnapshot = params.p_address ?? null;
  const customerNote = (params.p_customer_note as string | null) ?? null;
  const idempotencyKey = String(params.p_idempotency_key ?? newUuid());
  const pointsToRedeem = Number(params.p_points_redeemed ?? 0) || 0;
  const restaurantId = String(
    params.p_restaurant_id ?? "b54b2620-90c5-4295-b617-bc1389db3ee9",
  );

  // Idempotency: a retried submit returns the order already written.
  const existing = await db
    .prepare('SELECT * FROM "orders" WHERE "user_id" = ? AND "idempotency_key" = ?')
    .bind(userId, idempotencyKey)
    .first<Record<string, unknown>>();
  if (existing) return fromSqlRow("orders", existing);

  const subtotal = money(
    lines.reduce((sum, line) => sum + Number(line.unit_price) * Number(line.quantity), 0),
  );

  // The delivery fee comes from the zone whose `areas` contains the address.
  let deliveryFee = 0;
  let etaMinutes: number | null = null;
  if (fulfillment === "delivery") {
    const area = addressSnapshot && typeof addressSnapshot === "object"
      ? String((addressSnapshot as Record<string, unknown>).area ?? "")
      : "";
    const zone = await db
      .prepare(
        'SELECT * FROM "delivery_zones" WHERE "is_active" = 1 AND EXISTS (SELECT 1 FROM json_each("areas") WHERE value = ?) LIMIT 1',
      )
      .bind(area)
      .first<Record<string, unknown>>();
    if (zone) {
      deliveryFee = Number(zone.fee ?? 0);
      etaMinutes = zone.eta_minutes === null ? null : Number(zone.eta_minutes);
      if (zone.free_over !== null && subtotal >= Number(zone.free_over)) deliveryFee = 0;
    }
  }

  // The best enabled offer at or under the subtotal.
  const offer = await db
    .prepare(
      'SELECT * FROM "offers" WHERE "is_enabled" = 1 AND "threshold" <= ? ORDER BY "threshold" DESC LIMIT 1',
    )
    .bind(subtotal)
    .first<Record<string, unknown>>();
  let discount = 0;
  let offerId: string | null = null;
  let offerName: string | null = null;
  if (offer) {
    offerId = String(offer.id);
    offerName = String(offer.name_en ?? "");
    const raw = offer.kind === "percent"
      ? (subtotal * Number(offer.value)) / 100
      : Number(offer.value);
    discount = money(offer.max_discount === null ? raw : Math.min(raw, Number(offer.max_discount)));
  }

  const total = money(Math.max(0, subtotal - discount + deliveryFee));
  const pointsEarned = Math.floor(total);
  const orderId = newUuid();
  const orderNumber = await nextOrderNumber();
  const now = nowIso();

  const order: Record<string, unknown> = {
    id: orderId,
    order_number: orderNumber,
    idempotency_key: idempotencyKey,
    user_id: userId,
    status: "new",
    fulfillment,
    payment_method: paymentMethod,
    payment_status: "unpaid",
    currency: "EGP",
    subtotal,
    discount_total: discount,
    delivery_fee: deliveryFee,
    tax_total: 0,
    total,
    points_redeemed: pointsToRedeem,
    points_earned: pointsEarned,
    address_snapshot: addressSnapshot,
    customer_note: customerNote,
    eta_minutes: etaMinutes,
    restaurant_id: restaurantId,
    offer_id: offerId,
    offer_name: offerName,
    created_at: now,
    updated_at: now,
  };

  const columns = Object.keys(order);
  const statements = [
    db
      .prepare(
        `INSERT INTO "orders" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      )
      .bind(...columns.map((c) => toSqlValue("orders", c, order[c]) as D1Value)),
  ];

  for (const line of lines) {
    const lineTotal = money(Number(line.unit_price) * Number(line.quantity));
    const item: Record<string, unknown> = {
      id: newUuid(),
      order_id: orderId,
      menu_item_id: line.menu_item_id ?? null,
      name_snapshot: line.name_snapshot ?? "",
      name_ar_snapshot: line.name_ar_snapshot ?? null,
      unit_price: Number(line.unit_price),
      quantity: Number(line.quantity),
      line_total: lineTotal,
      modifiers: line.modifiers ?? [],
      notes: line.notes ?? null,
      created_at: now,
    };
    const itemColumns = Object.keys(item);
    statements.push(
      db
        .prepare(
          `INSERT INTO "order_items" (${itemColumns.map((c) => `"${c}"`).join(", ")}) VALUES (${itemColumns.map(() => "?").join(", ")})`,
        )
        .bind(...itemColumns.map((c) => toSqlValue("order_items", c, item[c]) as D1Value)),
    );
  }

  // Every status change is recorded; the customer timeline reads this table.
  statements.push(
    db
      .prepare(
        'INSERT INTO "order_status_history" ("order_id", "from_status", "to_status", "changed_by", "note", "created_at") VALUES (?, NULL, ?, ?, ?, ?)',
      )
      .bind(orderId, "new", userId, "Order placed", now),
  );

  statements.push(
    db
      .prepare(
        'INSERT INTO "notifications" ("user_id", "kind", "title", "body", "link", "created_at", "audience", "category") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        userId,
        "order_placed",
        `Order ${orderNumber} received`,
        "We have your order and will start on it shortly.",
        `/orders/${orderId}`,
        now,
        "customer",
        "order",
      ),
  );

  const results = await db.batch(statements);
  const failed = results.find((r) => !r.success);
  if (failed) throw new Error(failed.error ?? "place_order failed");

  return fromSqlRow("orders", order);
};

const cancelOrder: Handler = async (params, context) => {
  const db = getD1Database();
  const orderId = String(params.p_order_id ?? "");
  const userId = String(params.p_user_id ?? context.userId ?? "");
  const reason = (params.p_reason as string | null) ?? null;
  const now = nowIso();

  const order = await db
    .prepare('SELECT * FROM "orders" WHERE "id" = ?')
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!order) throw new Error("cancel_order: not found");
  if (!context.elevated && String(order.user_id) !== userId) {
    throw new Error("cancel_order: not your order");
  }

  await db.batch([
    db
      .prepare('UPDATE "orders" SET "status" = ?, "cancel_reason" = ?, "canceled_at" = ?, "updated_at" = ? WHERE "id" = ?')
      .bind("canceled", reason, now, now, orderId),
    db
      .prepare(
        'INSERT INTO "order_status_history" ("order_id", "from_status", "to_status", "changed_by", "note", "created_at") VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(orderId, String(order.status), "canceled", userId, reason, now),
  ]);

  return null;
};

const HANDLERS: Record<string, Handler> = {
  place_order: placeOrder,
  cancel_order: cancelOrder,
};

/** Names the app calls that are not ported yet, so a miss is obvious. */
export const KNOWN_UNPORTED = new Set<string>();

export async function runRpc<T = unknown>(
  name: string,
  params: Record<string, unknown>,
  context: RpcContext,
): Promise<QueryResult<T>> {
  const handler = HANDLERS[name];
  if (!handler) {
    return {
      data: null as unknown as T,
      error: {
        message:
          `d1-compat: rpc "${name}" is not ported yet. Add it to src/lib/d1/rpc.ts ` +
          `with the same arguments and return shape as the Postgres function.`,
        code: "PGRST202",
      },
      status: 404,
    };
  }
  try {
    const data = (await handler(params, context)) as T;
    return { data, error: null };
  } catch (error) {
    return {
      data: null as unknown as T,
      error: { message: error instanceof Error ? error.message : String(error) },
      status: 500,
    };
  }
}
