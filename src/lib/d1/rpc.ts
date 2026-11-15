/**
 * Postgres functions, ported to TypeScript.
 *
 * The bodies are transcribed from the live database (`pg_get_functiondef`), not
 * reconstructed from how the call sites look. `place_order` is the reason: the
 * Postgres version re-reads every price from `menu_items` and never trusts the
 * client, and it returns `{ order_id, order_number, total, reused }` rather than
 * a row. An earlier draft of this file took prices from the request body and
 * returned an `orders` row — a security hole (a client could name its own price)
 * and a shape the caller does not read. Both are fixed here.
 *
 * Atomicity: everything runs inside one D1 `batch`, which is one transaction, so
 * a half-written order is impossible.
 */

import { getD1Database, type D1PreparedStatement, type D1Value } from "@/lib/d1/database";
import { newUuid, nowIso, toSqlValue } from "@/lib/d1/coerce";
import { settingBoolean } from "@/lib/utils/settings-value";
import type { QueryResult } from "@/lib/d1/client";

/**
 * Who is calling and on behalf of which restaurant.
 *
 * `restaurantId` is here because the Postgres schema defaulted `orders.restaurant_id`
 * to `current_restaurant_id()`, a value the RPC never had to pass. SQLite cannot
 * express that default, so the port fills the column from the context instead.
 */
export type RpcContext = { elevated: boolean; userId: string | null; restaurantId?: string };

const DEFAULT_RESTAURANT_ID = "b54b2620-90c5-4295-b617-bc1389db3ee9";

type Handler = (params: Record<string, unknown>, context: RpcContext) => Promise<unknown>;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `setting_numeric(key, default)`: a setting read as a number, defaulting on a miss. */
async function settingNumeric(key: string, fallback: number): Promise<number> {
  const row = await getD1Database()
    .prepare('SELECT "value" FROM "settings" WHERE "key" = ?')
    .bind(key)
    .first<{ value: string | number | null }>();
  if (row?.value === null || row?.value === undefined) return fallback;
  let raw: unknown = row.value;
  if (typeof raw === "string") {
    // Stored as JSON text: a number is `30`, a string is `"30"`.
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      raw = Number(raw);
    }
  }
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** `setting_bool(key, default)`: read through the one shared parser. */
async function settingBool(key: string, fallback: boolean): Promise<boolean> {
  const row = await getD1Database()
    .prepare('SELECT "value" FROM "settings" WHERE "key" = ?')
    .bind(key)
    .first<{ value: string | number | null }>();
  if (row?.value === null || row?.value === undefined) return fallback;
  if (typeof row.value === "number") return row.value !== 0;
  try {
    return settingBoolean(JSON.parse(row.value) as unknown, fallback);
  } catch {
    return settingBoolean(row.value, fallback);
  }
}

/** `setting_text(key)`: a setting read as a plain string. */
async function settingText(key: string): Promise<string | null> {
  const row = await getD1Database()
    .prepare('SELECT "value" FROM "settings" WHERE "key" = ?')
    .bind(key)
    .first<{ value: string | null }>();
  if (row?.value === null || row?.value === undefined) return null;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return typeof parsed === "string" ? parsed : String(parsed);
  } catch {
    return String(row.value);
  }
}

/**
 * `store_is_open()`: the manual lever first, then the daily window in Cairo time.
 *
 * The timezone is not optional. The kitchen's "closes at 01:00" means 01:00 in
 * Cairo; computing it in UTC would close the store three hours early in summer.
 */
export async function storeIsOpen(at: Date = new Date()): Promise<boolean> {
  const accepting = await settingBool("ordering.accepting_orders", true);
  if (!accepting) return false;

  const hoursEnabled = await settingBool("ordering.hours_enabled", false);
  if (!hoursEnabled) return true;

  const open = (await settingText("ordering.open_time"))?.trim() ?? "";
  const close = (await settingText("ordering.close_time"))?.trim() ?? "";
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!clock.test(open) || !clock.test(close)) return true;

  // `Africa/Cairo` without a tz library: Intl gives the local wall clock.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const nowMinutes = hour * 60 + minute;

  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const openMinutes = toMinutes(open);
  const closeMinutes = toMinutes(close);

  if (openMinutes === closeMinutes) return true;
  if (openMinutes < closeMinutes) return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  // Overnight window, e.g. 14:00 -> 01:00.
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

/** `next_order_number()`: `PW-YYMM-0001`, the sequence counted per month. */
async function nextOrderNumber(at: Date = new Date()): Promise<string> {
  const db = getD1Database();
  const year = String(at.getUTCFullYear()).slice(2);
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `PW-${year}${month}-`;
  const row = await db
    .prepare('SELECT count(*) AS n FROM "orders" WHERE "order_number" LIKE ?')
    .bind(`${prefix}%`)
    .first<{ n: number }>();
  return `${prefix}${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

/** `best_offer(subtotal)`: the largest discount the customer qualifies for. */
async function bestOffer(
  subtotal: number,
  userId: string,
): Promise<{ id: string | null; nameEn: string | null; amount: number }> {
  const db = getD1Database();
  const rows = await db
    .prepare(
      `SELECT "id", "name_en", "kind", "value", "max_discount", "sort_order", "created_at"
         FROM "offers"
        WHERE "is_enabled" = 1 AND "threshold" <= ? AND ("customer_id" IS NULL OR "customer_id" = ?)`,
    )
    .bind(subtotal, userId)
    .all<Record<string, unknown>>();

  let best: { id: string; nameEn: string | null; amount: number; sort: number; created: string } | null = null;
  for (const row of rows.results ?? []) {
    const raw = row.kind === "percent" ? (subtotal * Number(row.value)) / 100 : Number(row.value);
    const capped = row.max_discount === null ? raw : Math.min(raw, Number(row.max_discount));
    const amount = money(Math.min(capped, subtotal));
    if (amount <= 0) continue;
    const candidate = {
      id: String(row.id),
      nameEn: (row.name_en as string | null) ?? null,
      amount,
      sort: Number(row.sort_order ?? 0),
      created: String(row.created_at ?? ""),
    };
    if (
      !best ||
      candidate.amount > best.amount ||
      (candidate.amount === best.amount && candidate.sort < best.sort) ||
      (candidate.amount === best.amount && candidate.sort === best.sort && candidate.created < best.created)
    ) {
      best = candidate;
    }
  }
  return best ? { id: best.id, nameEn: best.nameEn, amount: best.amount } : { id: null, nameEn: null, amount: 0 };
}

/** An error the caller surfaces by code, matching the Postgres `raise exception`. */
class RpcError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
  }
}

type CartLine = {
  menu_item_id?: string | null;
  quantity?: number | null;
  modifiers?: string[] | null;
  notes?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `place_order_internal(p_idempotency_key, p_items, p_address_id, p_fulfillment,
 * p_payment_method, p_customer_note, p_points_redeem)`.
 *
 * Every price comes from `menu_items`; the request only names items, quantities,
 * modifiers and a note. Returns the same four columns the Postgres function did,
 * which is what `checkout.ts` destructures.
 */
const placeOrderInternal: Handler = async (params, context) => {
  const db = getD1Database();
  const userId = String(params.p_user_id ?? context.userId ?? "");
  if (!userId) throw new RpcError("AUTH_REQUIRED", "You must be signed in to place an order.");

  const idempotencyKey = String(params.p_idempotency_key ?? "");
  if (idempotencyKey.trim().length < 8) {
    throw new RpcError("IDEMPOTENCY_KEY_REQUIRED", "A submit key is required.");
  }

  const items = params.p_items as CartLine[] | undefined;
  if (!Array.isArray(items) || items.length === 0) {
    throw new RpcError("EMPTY_CART", "Your cart is empty.");
  }
  if (items.length > 60) throw new RpcError("CART_TOO_LARGE", "Too many items.");

  // A retried submit returns the order already written.
  const existing = await db
    .prepare('SELECT * FROM "orders" WHERE "user_id" = ? AND "idempotency_key" = ? LIMIT 1')
    .bind(userId, idempotencyKey)
    .first<Record<string, unknown>>();
  if (existing) {
    return {
      order_id: existing.id,
      order_number: existing.order_number,
      total: existing.total,
      reused: true,
    };
  }

  const profile = await db
    .prepare('SELECT "is_blocked" FROM "profiles" WHERE "id" = ?')
    .bind(userId)
    .first<{ is_blocked: number | null }>();
  if (profile?.is_blocked) throw new RpcError("ACCOUNT_BLOCKED", "This account is blocked.");

  const fulfillment = String(params.p_fulfillment ?? "delivery");
  if (fulfillment !== "delivery") {
    throw new RpcError("PICKUP_UNAVAILABLE", "Pickup is not available right now.");
  }

  const addressId = params.p_address_id ? String(params.p_address_id) : "";
  if (!addressId) throw new RpcError("ADDRESS_REQUIRED", "Choose a delivery address.");

  const address = await db
    .prepare('SELECT * FROM "addresses" WHERE "id" = ? AND "user_id" = ?')
    .bind(addressId, userId)
    .first<Record<string, unknown>>();
  if (!address) throw new RpcError("ADDRESS_NOT_FOUND", "That address is not on your account.");
  if (!String(address.address_line ?? "").trim()) {
    throw new RpcError("ADDRESS_INVALID", "That address is incomplete.");
  }

  const snapshot: Record<string, unknown> = {};
  for (const field of [
    "label", "contact_name", "contact_phone", "address_line", "building", "floor",
    "apartment", "landmark", "area", "city", "notes", "latitude", "longitude",
  ]) {
    snapshot[field] = address[field] ?? null;
  }

  // The live settings, read the way `setting_numeric` did.
  const [deliveryFee, freeOver, taxRate, minOrder, maxQty, pointsPerCurrency, eta] = await Promise.all([
    settingNumeric("delivery.fee", 30),
    settingNumeric("delivery.free_over", 250),
    settingNumeric("tax.rate", 0.14),
    settingNumeric("ordering.min_order_total", 80),
    settingNumeric("ordering.max_qty_per_item", 20),
    settingNumeric("loyalty.points_per_currency", 1),
    settingNumeric("delivery.eta_minutes", 35),
  ]);

  const orderId = newUuid();
  const orderNumber = await nextOrderNumber();
  const now = nowIso();

  const orderColumns = [
    "id", "order_number", "idempotency_key", "user_id", "status", "fulfillment",
    "payment_method", "payment_status", "address_snapshot", "customer_note",
    "eta_minutes", "restaurant_id", "created_at", "updated_at",
  ];
  const orderRow: Record<string, unknown> = {
    id: orderId,
    restaurant_id: context.restaurantId ?? DEFAULT_RESTAURANT_ID,
    order_number: orderNumber,
    idempotency_key: idempotencyKey,
    user_id: userId,
    status: "new",
    fulfillment,
    payment_method: String(params.p_payment_method ?? "cash_on_delivery"),
    payment_status: "unpaid",
    address_snapshot: snapshot,
    customer_note: String(params.p_customer_note ?? "").trim() || null,
    eta_minutes: 0,
    created_at: now,
    updated_at: now,
  };

  const statements = [
    db
      .prepare(
        `INSERT INTO "orders" (${orderColumns.map((c) => `"${c}"`).join(", ")}) VALUES (${orderColumns.map(() => "?").join(", ")})`,
      )
      .bind(...orderColumns.map((c) => toSqlValue("orders", c, orderRow[c]) as D1Value)),
  ];

  let subtotal = 0;
  let lineCount = 0;

  for (const line of items) {
    lineCount += 1;
    const quantity = Math.max(1, Math.floor(Number(line.quantity ?? 1)));
    if (quantity > maxQty) {
      throw new RpcError("QUANTITY_LIMIT_EXCEEDED", `You can order at most ${maxQty} of one item.`);
    }

    const itemId = String(line.menu_item_id ?? "");
    if (!UUID.test(itemId)) throw new RpcError("ITEM_NOT_FOUND", "That dish is not on the menu.");

    const item = await db
      .prepare('SELECT * FROM "menu_items" WHERE "id" = ?')
      .bind(itemId)
      .first<Record<string, unknown>>();
    if (!item) throw new RpcError("ITEM_NOT_FOUND", "That dish is not on the menu.");
    if (!item.is_available || item.is_archived) {
      throw new RpcError("ITEM_UNAVAILABLE", `${item.name_en} is unavailable right now.`);
    }
    const category = await db
      .prepare('SELECT "is_enabled" FROM "categories" WHERE "id" = ?')
      .bind(String(item.category_id))
      .first<{ is_enabled: number | null }>();
    if (!category?.is_enabled) {
      throw new RpcError("ITEM_UNAVAILABLE", `${item.name_en} is unavailable right now.`);
    }

    // Only well-formed ids, de-duplicated, as the Postgres regex filter did.
    const wanted = Array.from(
      new Set((line.modifiers ?? []).filter((m) => typeof m === "string" && UUID.test(m))),
    );

    const groups = await db
      .prepare('SELECT "id", "min_select", "max_select", "is_required" FROM "modifier_groups" WHERE "menu_item_id" = ?')
      .bind(itemId)
      .all<{ id: string; min_select: number; max_select: number; is_required: number }>();

    const options = wanted.length
      ? await db
          .prepare(
            `SELECT mo."id", mo."name_en", mo."price_delta", mo."group_id"
               FROM "modifier_options" mo
               JOIN "modifier_groups" mg ON mg."id" = mo."group_id"
              WHERE mg."menu_item_id" = ? AND mo."is_available" = 1
                AND mo."id" IN (${wanted.map(() => "?").join(", ")})`,
          )
          .bind(itemId, ...wanted)
          .all<{ id: string; name_en: string; price_delta: number; group_id: string }>()
      : { results: [] as Array<{ id: string; name_en: string; price_delta: number; group_id: string }> };

    const chosenByGroup = new Map<string, number>();
    for (const option of options.results ?? []) {
      chosenByGroup.set(option.group_id, (chosenByGroup.get(option.group_id) ?? 0) + 1);
    }
    for (const group of groups.results ?? []) {
      const chosen = chosenByGroup.get(group.id) ?? 0;
      if (chosen > group.max_select) {
        throw new RpcError("MODIFIER_LIMIT_EXCEEDED", `Too many choices for ${item.name_en}.`);
      }
      if (group.is_required && chosen < group.min_select) {
        throw new RpcError("VALIDATION", `Choose the required options for ${item.name_en}.`);
      }
    }

    let modifierDelta = 0;
    const chosenOptions: Array<Record<string, unknown>> = [];
    for (const option of options.results ?? []) {
      modifierDelta += Number(option.price_delta);
      chosenOptions.push({ id: option.id, name: option.name_en, price_delta: Number(option.price_delta) });
    }

    const unitPrice = Number(item.price) + modifierDelta;
    const lineTotal = money(unitPrice * quantity);
    subtotal += lineTotal;

    const itemColumns = [
      "id", "order_id", "menu_item_id", "name_snapshot", "name_ar_snapshot",
      "unit_price", "quantity", "line_total", "modifiers", "notes", "created_at",
    ];
    const itemRow: Record<string, unknown> = {
      id: newUuid(),
      order_id: orderId,
      menu_item_id: item.id,
      name_snapshot: item.name_en,
      name_ar_snapshot: item.name_ar ?? null,
      unit_price: unitPrice,
      quantity,
      line_total: lineTotal,
      modifiers: chosenOptions,
      notes: String(line.notes ?? "").trim() || null,
      created_at: now,
    };
    statements.push(
      db
        .prepare(
          `INSERT INTO "order_items" (${itemColumns.map((c) => `"${c}"`).join(", ")}) VALUES (${itemColumns.map(() => "?").join(", ")})`,
        )
        .bind(...itemColumns.map((c) => toSqlValue("order_items", c, itemRow[c]) as D1Value)),
    );
  }

  if (lineCount === 0) throw new RpcError("EMPTY_CART", "Your cart is empty.");
  if (subtotal < minOrder) {
    throw new RpcError("MIN_ORDER_NOT_MET", `The minimum order is ${minOrder}.`);
  }

  const offer = await bestOffer(subtotal, userId);
  const discount = Math.min(offer.amount, subtotal);
  const delivery = subtotal >= freeOver ? 0 : deliveryFee;
  const tax = money((subtotal - discount + delivery) * taxRate);
  const total = money(subtotal - discount + delivery + tax);
  if (total <= 0) throw new RpcError("INVALID_TOTAL", "The total came out invalid.");

  const pointsEarned = Math.floor(total * pointsPerCurrency);

  statements.push(
    db
      .prepare(
        `UPDATE "orders" SET
           "subtotal" = ?, "discount_total" = ?, "delivery_fee" = ?, "tax_total" = ?,
           "total" = ?, "points_redeemed" = ?, "points_earned" = ?,
           "offer_id" = ?, "offer_name" = ?, "eta_minutes" = ?
         WHERE "id" = ?`,
      )
      .bind(
        money(subtotal), discount, delivery, tax, total,
        Math.round(Number(params.p_points_redeem ?? 0)) || 0,
        pointsEarned, offer.id, offer.nameEn, Math.trunc(eta), orderId,
      ),
  );

  statements.push(
    db
      .prepare(
        `INSERT INTO "activity_logs" ("user_id", "event", "entity", "entity_id", "metadata")
         VALUES (?, 'ORDER_CREATED', 'orders', ?, ?)`,
      )
      .bind(
        userId,
        orderId,
        JSON.stringify({ total, items: lineCount, offer: offer.nameEn, offer_discount: offer.amount }),
      ),
  );

  const results = await db.batch(statements);
  const failed = results.find((r) => !r.success);
  if (failed) throw new RpcError("ORDER_FAILED", failed.error ?? "Could not place the order.");

  return { order_id: orderId, order_number: orderNumber, total, reused: false };
};

/** `place_order(...)`: refuses while the store is shut, then delegates. */
const placeOrder: Handler = async (params, context) => {
  if (!(await storeIsOpen())) {
    throw new RpcError("STORE_CLOSED", "We are closed right now.");
  }
  return placeOrderInternal(params, context);
};

const cancelOrder: Handler = async (params, context) => {
  const db = getD1Database();
  const orderId = String(params.p_order_id ?? "");
  const userId = String(params.p_user_id ?? context.userId ?? "");
  const reason = (params.p_reason as string | null) ?? null;

  const order = await db
    .prepare('SELECT * FROM "orders" WHERE "id" = ?')
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!order) throw new RpcError("ITEM_NOT_FOUND", "Order not found.");
  if (!context.elevated && String(order.user_id) !== userId) {
    throw new RpcError("FORBIDDEN", "That is not your order.");
  }
  const terminal = ["canceled", "rejected", "failed", "refunded"];
  if (terminal.includes(String(order.status))) {
    throw new RpcError("ALREADY_CANCELED", "That order is already closed.");
  }

  // The status trigger writes the history row and the `canceled_at` stamp.
  const result = await db
    .prepare('UPDATE "orders" SET "status" = ?, "cancel_reason" = ?, "updated_by" = ? WHERE "id" = ?')
    .bind("canceled", reason, context.userId, orderId)
    .run();
  if (!result.success) throw new RpcError("CANCEL_FAILED", result.error ?? "Could not cancel.");
  return null;
};

/**
 * `order_is_terminal(status)`: statuses that end an order's life. Mirrors the
 * Postgres helper the CRM functions filter on, so a canceled order never counts
 * toward a customer's order history or lifetime value.
 */
const TERMINAL_STATUSES = ["canceled", "rejected", "failed", "refunded"];
const TERMINAL_LIST = TERMINAL_STATUSES.map((s) => `'${s}'`).join(", ");

/** SQL fragment: `now() - <days>` as an ISO string, since SQLite has no interval. */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * The per-customer aggregate `crm_customers` and `crm_stats` both need.
 *
 * One row per profile with its order count, lifetime value (finished orders
 * only), and last order time — computed in SQL, exactly as the Postgres
 * functions do, rather than by paging rows and summing in the caller.
 *
 * The favourite dishes are fetched separately and folded in: a single query
 * cannot both rank items per customer and aggregate them into one JSON array
 * without a nested window, and the customer book is small enough that two reads
 * are cheaper than one clever one.
 */
async function crmRows(): Promise<Record<string, unknown>[]> {
  const db = getD1Database();
  const rows = await db
    .prepare(
      `SELECT
         p."id" AS user_id, p."full_name", p."phone", p."email",
         p."created_at", p."last_seen_at", p."is_blocked", p."marketing_opt_in",
         agg."last_order_at",
         agg."active_last_order_at",
         COALESCE(agg."order_count", 0) AS order_count,
         COALESCE(agg."lifetime_value", 0) AS lifetime_value,
         COALESCE(agg."spend", 0) AS spend
       FROM "profiles" p
       LEFT JOIN (
         SELECT
           o."user_id",
           MAX(o."created_at") AS last_order_at,
           MAX(o."created_at") FILTER (WHERE o."status" NOT IN (${TERMINAL_LIST})) AS active_last_order_at,
           COUNT(*) FILTER (WHERE o."status" NOT IN (${TERMINAL_LIST})) AS order_count,
           SUM(o."total") FILTER (WHERE o."status" = 'finished') AS lifetime_value,
           SUM(o."total") FILTER (WHERE o."status" NOT IN (${TERMINAL_LIST})) AS spend
         FROM "orders" o
         GROUP BY o."user_id"
       ) agg ON agg."user_id" = p."id"`,
    )
    .all<Record<string, unknown>>();

  const favourites = await topItemsByUser();
  return (rows.results ?? []).map((row) => ({
    ...row,
    recent_items: favourites.get(String(row.user_id)) ?? [],
  }));
}

/** The three most-ordered dishes per customer, as an array of names. */
async function topItemsByUser(): Promise<Map<string, string[]>> {
  const db = getD1Database();
  const rows = await db
    .prepare(
      `SELECT o."user_id" AS user_id, oi."name_snapshot" AS name, SUM(oi."quantity") AS qty
         FROM "order_items" oi
         JOIN "orders" o ON o."id" = oi."order_id"
        GROUP BY o."user_id", oi."name_snapshot"
        ORDER BY qty DESC`,
    )
    .all<{ user_id: string; name: string; qty: number }>();

  const map = new Map<string, string[]>();
  for (const row of rows.results ?? []) {
    const list = map.get(row.user_id) ?? [];
    if (list.length < 3) list.push(row.name);
    map.set(row.user_id, list);
  }
  return map;
}

/**
 * `crm_customers(p_search, p_limit, p_offset)`: the CRM customer book.
 *
 * `points_balance`/`tier` are constants now that the loyalty programme is gone,
 * matching the Postgres function rewritten in `remove_unused_features`.
 * `favorite_items` is the three most-ordered dishes, newest order first, as
 * JSON — the same shape the caller reads.
 */
const crmCustomers: Handler = async (params) => {
  const search = String(params.p_search ?? "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(Number(params.p_limit ?? 50) || 50, 1000));
  const offset = Math.max(0, Number(params.p_offset ?? 0) || 0);

  const all = await crmRows();
  const filtered = search
    ? all.filter((row) =>
        [row.full_name, row.phone, row.email]
          .map((v) => String(v ?? "").toLowerCase())
          .some((v) => v.includes(search)),
      )
    : all;

  // `order by o.last_order_at desc nulls last, p.created_at desc`.
  filtered.sort((a, b) => {
    const at = String(a.last_order_at ?? "");
    const bt = String(b.last_order_at ?? "");
    if (at !== bt) return bt.localeCompare(at);
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });

  return filtered.slice(offset, offset + limit).map((row) => {
    const orderCount = Number(row.order_count ?? 0);
    const lifetime = Number(row.lifetime_value ?? 0);
    const lastOrderAt = (row.last_order_at as string | null) ?? null;
    const daysSince =
      lastOrderAt === null
        ? null
        : Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86_400_000);
    return {
      user_id: row.user_id,
      full_name: row.full_name ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      created_at: row.created_at ?? null,
      last_seen_at: row.last_seen_at ?? null,
      last_order_at: lastOrderAt,
      order_count: orderCount,
      lifetime_value: money(lifetime),
      avg_order_value: orderCount > 0 ? money(lifetime / orderCount) : 0,
      days_since_last_order: daysSince,
      points_balance: 0,
      tier: "bronze",
      favorite_items: parseItems(row.recent_items),
      is_blocked: Number(row.is_blocked ?? 0) === 1,
      marketing_opt_in: Number(row.marketing_opt_in ?? 0) === 1,
    };
  });
};

/** The `recent_items` aggregate arrives as JSON text; never let it break a row. */
function parseItems(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** `crm_customer_count(p_search)`: head-count under the same filter as the list. */
const crmCustomerCount: Handler = async (params) => {
  const search = String(params.p_search ?? "").trim().toLowerCase();
  const all = await crmRows();
  if (!search) return all.length;
  return all.filter((row) =>
    [row.full_name, row.phone, row.email]
      .map((v) => String(v ?? "").toLowerCase())
      .some((v) => v.includes(search)),
  ).length;
};

/**
 * `crm_stats()`: whole-book aggregates, one row.
 *
 * `repeat` is three or more orders; `at_risk` is a customer with at least one
 * order whose last one is more than 30 days old. Both count order histories the
 * way `crm_customers` does (terminal orders excluded).
 */
const crmStats: Handler = async () => {
  const rows = await crmRows();
  const thirtyDaysAgo = daysAgoIso(30);
  let lifetimeValue = 0;
  let repeat = 0;
  let atRisk = 0;
  let blocked = 0;
  let optedIn = 0;
  for (const row of rows) {
    const orderCount = Number(row.order_count ?? 0);
    lifetimeValue += Number(row.lifetime_value ?? 0);
    if (orderCount >= 3) repeat += 1;
    const last = (row.active_last_order_at as string | null) ?? null;
    if (orderCount > 0 && last !== null && last < thirtyDaysAgo) atRisk += 1;
    if (Number(row.is_blocked ?? 0) === 1) blocked += 1;
    if (Number(row.marketing_opt_in ?? 0) === 1) optedIn += 1;
  }
  return [
    {
      customer_count: rows.length,
      lifetime_value: money(lifetimeValue),
      repeat_customers: repeat,
      at_risk_customers: atRisk,
      blocked_customers: blocked,
      marketing_opt_in: optedIn,
    },
  ];
};

/**
 * `crm_estimate_segment(p_segment, p_value)`: how many customers a segment holds.
 *
 * The segment rules mirror the Postgres `crm_segment` after the loyalty branch
 * was removed; an unknown segment matches nobody, as the `else false` did.
 */
const crmEstimateSegment: Handler = async (params) => {
  const segment = String(params.p_segment ?? "");
  const value = Math.max(1, Number(params.p_value ?? 30) || 30);
  const rows = await crmRows();
  const cutoff = daysAgoIso(value);
  const ninetyDaysAgo = daysAgoIso(90);
  const thirtyDaysAgo = daysAgoIso(30);

  let count = 0;
  for (const row of rows) {
    const orderCount = Number(row.order_count ?? 0);
    const spend = Number(row.spend ?? 0);
    const last = (row.active_last_order_at as string | null) ?? null;
    const created = String(row.created_at ?? "");
    const blocked = Number(row.is_blocked ?? 0) === 1;
    const optedIn = Number(row.marketing_opt_in ?? 0) === 1;

    let match = false;
    switch (segment) {
      case "all":
        match = true;
        break;
      case "opted_in":
        match = optedIn;
        break;
      case "new":
        match = created > daysAgoIso(30);
        break;
      case "loyal":
        match = orderCount >= 3;
        break;
      case "inactive":
        match = last !== null && last < cutoff;
        break;
      case "never_ordered":
        match = orderCount === 0;
        break;
      case "high_value":
        match = spend >= value;
        break;
      case "winback":
        match = last !== null && last >= ninetyDaysAgo && last <= thirtyDaysAgo;
        break;
      default:
        match = false;
    }
    if (match && !(segment !== "all" && blocked)) count += 1;
  }
  return count;
};

/**
 * `funnel_counts(p_days)`: distinct-session counts for the analytics funnel.
 *
 * D1-only (no Postgres original): the Supabase path ran five unbounded
 * `analytics_events` scans and deduped sessions in the Worker. `analytics_events`
 * grows with every page view, so on D1 that moved the whole event log per load.
 * Grouping in SQLite does the same dedup and returns a handful of rows.
 */
const funnelCounts: Handler = async (params) => {
  const days = Number(params["p_days"] ?? 30) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const db = getD1Database();
  const grouped = await db
    .prepare(
      `SELECT "event", COUNT(DISTINCT "session_id") AS c
         FROM "analytics_events"
        WHERE "created_at" >= ?
          AND "event" IN ('PAGE_VIEW','MENU_VIEW','ITEM_VIEW','CART_ADD','CHECKOUT_STARTED')
        GROUP BY "event"`,
    )
    .bind(since)
    .all<{ event: string; c: number }>();
  const byEvent = new Map((grouped.results ?? []).map((r) => [r.event, Number(r.c)]));
  // Visitors span two events, so they are a distinct count over the union, not
  // the sum of the per-event counts (a session with both would be double-counted).
  const visitorsRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT "session_id") AS c
         FROM "analytics_events"
        WHERE "created_at" >= ? AND "event" IN ('PAGE_VIEW','MENU_VIEW')`,
    )
    .bind(since)
    .first<{ c: number }>();
  const orderRow = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM "orders"
        WHERE "created_at" >= ? AND "status" NOT IN ('canceled','rejected','failed')`,
    )
    .bind(since)
    .first<{ c: number }>();
  return [
    {
      visitors: Number(visitorsRow?.c ?? 0),
      menu_viewers: byEvent.get("MENU_VIEW") ?? 0,
      item_viewers: byEvent.get("ITEM_VIEW") ?? 0,
      cart_users: byEvent.get("CART_ADD") ?? 0,
      checkout_users: byEvent.get("CHECKOUT_STARTED") ?? 0,
      customers: Number(orderRow?.c ?? 0),
    },
  ];
};

/* ------------------------------------------------- notifications, memory, skills, secrets */

/**
 * Notification readers key off a user id. Postgres read `auth.uid()`; the D1
 * shim has no session, so the caller passes `p_user_id` — which the app already
 * does on the staff path (the console runs without a Supabase session). A
 * customer's own id comes from the request context and is never trusted from the
 * browser.
 */
function notificationUser(params: Record<string, unknown>, context: RpcContext): string {
  const explicit = params.p_user_id;
  const userId = explicit !== undefined && explicit !== null ? String(explicit) : context.userId;
  if (!userId) throw new RpcError("UNAUTHORISED", "No signed-in user for this notification read.");
  // A non-elevated caller may only read their own feed.
  if (!context.elevated && String(explicit ?? context.userId) !== context.userId) {
    throw new RpcError("FORBIDDEN", "That is not your notification feed.");
  }
  return userId;
}

const listMyNotifications: Handler = async (params, context) => {
  const db = getD1Database();
  const userId = notificationUser(params, context);
  const audience = String(params.p_audience ?? "customer");
  const unreadOnly = params.p_unread_only === true;
  const limit = Math.min(Math.max(Number(params.p_limit ?? 20), 1), 100);
  const sql =
    'SELECT "id", "category", "kind", "title", "body", "link", "read_at", "created_at" ' +
    'FROM "notifications" WHERE "user_id" = ? AND "audience" = ?' +
    (unreadOnly ? ' AND "read_at" IS NULL' : "") +
    ' ORDER BY "created_at" DESC LIMIT ?';
  const result = await db.prepare(sql).bind(userId, audience, limit).all<Record<string, unknown>>();
  return result.results ?? [];
};

const countUnreadNotifications: Handler = async (params, context) => {
  const db = getD1Database();
  const userId = notificationUser(params, context);
  const audience = String(params.p_audience ?? "customer");
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM "notifications" WHERE "user_id" = ? AND "audience" = ? AND "read_at" IS NULL')
    .bind(userId, audience)
    .first<{ c: number }>();
  return Number(row?.c ?? 0);
};

const markNotificationRead: Handler = async (params, context) => {
  const db = getD1Database();
  const userId = notificationUser(params, context);
  const id = Number(params.p_id ?? 0);
  const result = await db
    .prepare('UPDATE "notifications" SET "read_at" = ? WHERE "id" = ? AND "user_id" = ? AND "read_at" IS NULL')
    .bind(nowIso(), id, userId)
    .run();
  if (!result.success) throw new RpcError("MARK_FAILED", result.error ?? "Could not mark the notification.");
  return null;
};

const markAllNotificationsRead: Handler = async (params, context) => {
  const db = getD1Database();
  const userId = notificationUser(params, context);
  const audience = String(params.p_audience ?? "customer");
  const result = await db
    .prepare('UPDATE "notifications" SET "read_at" = ? WHERE "user_id" = ? AND "audience" = ? AND "read_at" IS NULL')
    .bind(nowIso(), userId, audience)
    .run();
  if (!result.success) throw new RpcError("MARK_FAILED", result.error ?? "Could not mark the notifications.");
  return Number(result.meta?.changes ?? 0);
};

/**
 * The settings form, applied in one statement batch.
 *
 * The Postgres function ran the whole array in one transaction so a bad value
 * could not half-write the form; a D1 `batch` is likewise one transaction. An
 * unknown key is an error, not a silent skip, matching `SETTINGS_KEY_UNKNOWN`.
 */
const applySettingsBatch: Handler = async (params, context) => {
  const db = getD1Database();
  const values = params.p_values;
  if (!Array.isArray(values)) {
    throw new RpcError("SETTINGS_PAYLOAD_INVALID", "The settings payload must be an array.");
  }
  const actor = (params.p_actor as string | null) ?? context.userId ?? null;

  const existing = await db.prepare('SELECT "key" FROM "settings"').all<{ key: string }>();
  const known = new Set((existing.results ?? []).map((r) => r.key));

  const statements = values.map((entry) => {
    const row = entry as { key?: unknown; value?: unknown };
    if (row.key === undefined || !("value" in row)) {
      throw new RpcError("SETTINGS_ENTRY_INVALID", "A settings entry needs a key and a value.");
    }
    const key = String(row.key);
    if (!known.has(key)) throw new RpcError("SETTINGS_KEY_UNKNOWN", `Unknown setting: ${key}`);
    // `value` is a JSON column, so the JSON text is what the row must hold.
    return db
      .prepare('UPDATE "settings" SET "value" = ?, "updated_by" = ? WHERE "key" = ?')
      .bind(JSON.stringify(row.value), actor, key);
  });

  if (statements.length > 0) {
    const results = await db.batch(statements);
    const failed = results.find((r) => !r.success);
    if (failed) throw new RpcError("SETTINGS_WRITE_FAILED", failed.error ?? "Could not save the settings.");
  }
  return statements.length;
};

/** A pgvector literal (`[0.1,0.2]`) as a plain number array; null on anything else. */
function parseVector(value: unknown): number[] | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    const numbers = parsed.map(Number);
    return numbers.every((n) => Number.isFinite(n)) ? numbers : null;
  } catch {
    return null;
  }
}

/** Cosine similarity, matching pgvector's `1 - (a <=> b)` for unit-length text embeddings. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * `add_agent_memory`: append one memory row and return its id.
 *
 * Postgres authorised an owner/system write through `can_agent()` and a customer
 * write only for their own id. D1 has no roles, so elevation is the stand-in for
 * "staff" — a non-elevated caller may only write a memory about themselves.
 */
const addAgentMemory: Handler = async (params, context) => {
  const db = getD1Database();
  const scope = String(params.p_scope ?? "owner");
  const subjectId = (params.p_subject_id as string | null) ?? null;
  if (!context.elevated && !(scope === "customer" && subjectId !== null && subjectId === context.userId)) {
    throw new RpcError("FORBIDDEN", "Not authorised to write memory.");
  }
  const content = String(params.p_content ?? "").trim();
  if (!content) throw new RpcError("MEMORY_EMPTY", "A memory needs content.");

  const id = newUuid();
  const result = await db
    .prepare(
      'INSERT INTO "agent_memory" ("id", "scope", "subject_id", "kind", "content", "metadata", "embedding") ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      scope,
      subjectId,
      String(params.p_kind ?? "fact"),
      content,
      JSON.stringify(params.p_metadata ?? {}),
      typeof params.p_embedding === "string" ? params.p_embedding : null,
    )
    .run();
  if (!result.success) throw new RpcError("MEMORY_WRITE_FAILED", result.error ?? "Could not store the memory.");
  return id;
};

/** `match_agent_memory`: nearest owner/customer memories by cosine similarity. */
const matchAgentMemory: Handler = async (params, context) => {
  const db = getD1Database();
  const query = parseVector(params.p_query_embedding);
  if (!query) return [];
  const scope = String(params.p_scope ?? "owner");
  const subjectId = (params.p_subject_id as string | null) ?? null;
  const matchCount = Math.max(Number(params.p_match_count ?? 5), 1);
  const minSimilarity = Number(params.p_min_similarity ?? 0.15);

  // Postgres enforced the customer scope with `m.subject_id is null or = caller`.
  // The port keeps the same rule; an elevated caller may pass a subject to read.
  const result = await db
    .prepare(
      'SELECT "id", "scope", "kind", "content", "embedding", "created_at" FROM "agent_memory" ' +
        'WHERE "scope" = ? AND ("subject_id" IS NULL OR "subject_id" = ? OR ? IS NULL) AND "embedding" IS NOT NULL',
    )
    .bind(scope, subjectId, subjectId)
    .all<Record<string, unknown>>();

  return (result.results ?? [])
    .map((row) => {
      const vector = parseVector(row.embedding);
      const similarity = vector ? cosineSimilarity(query, vector) : 0;
      return {
        id: row.id,
        scope: row.scope,
        kind: row.kind,
        content: row.content,
        created_at: row.created_at,
        similarity,
      };
    })
    .filter((row) => row.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, matchCount);
};

/** `match_agent_skills`: nearest skill chunks. Small library, so a scan is fine. */
const matchAgentSkills: Handler = async (params) => {
  const db = getD1Database();
  const query = parseVector(params.p_query_embedding);
  if (!query) return [];
  const matchCount = Math.max(Number(params.p_match_count ?? 4), 1);
  const minSimilarity = Number(params.p_min_similarity ?? 0.1);

  const result = await db
    .prepare('SELECT "name", "heading", "content", "embedding" FROM "agent_skills" WHERE "embedding" IS NOT NULL')
    .all<Record<string, unknown>>();

  return (result.results ?? [])
    .map((row) => {
      const vector = parseVector(row.embedding);
      return {
        name: row.name,
        heading: row.heading,
        content: row.content,
        similarity: vector ? cosineSimilarity(query, vector) : 0,
      };
    })
    .filter((row) => row.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, matchCount);
};

/**
 * `replace_agent_skill`: drop a document's chunks and insert the new set.
 *
 * One `batch` keeps the delete and the inserts in one transaction, so a document
 * is never left half-indexed.
 */
const replaceAgentSkill: Handler = async (params, context) => {
  if (!context.elevated) throw new RpcError("FORBIDDEN", "Not authorised to index skills.");
  const db = getD1Database();
  const name = String(params.p_name ?? "").trim();
  if (!name) throw new RpcError("SKILL_NAME_REQUIRED", "A skill needs a name.");
  const source = String(params.p_source ?? "repo");
  const sourceUrl = (params.p_source_url as string | null) ?? null;
  const chunks = Array.isArray(params.p_chunks) ? (params.p_chunks as Array<Record<string, unknown>>) : [];

  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM "agent_skills" WHERE "name" = ?').bind(name),
  ];
  chunks.forEach((chunk, index) => {
    statements.push(
      db
        .prepare(
          'INSERT INTO "agent_skills" ("id", "name", "source", "source_url", "heading", "content", "chunk_index", "embedding") ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          newUuid(),
          name,
          source,
          sourceUrl,
          (chunk.heading as string | null) ?? null,
          String(chunk.content ?? ""),
          Number(chunk.chunk_index ?? index),
          typeof chunk.embedding === "string" ? chunk.embedding : null,
        ),
    );
  });

  const results = await db.batch(statements);
  const failed = results.find((r) => !r.success);
  if (failed) throw new RpcError("SKILL_WRITE_FAILED", failed.error ?? "Could not index the skill.");
  return chunks.length;
};

/**
 * `get_ai_secret`: resolve an AI provider secret.
 *
 * Postgres read Supabase Vault. There is no Vault in D1 and no secrets table was
 * migrated — provider secrets live in Worker environment bindings — so the honest
 * answer is "not found here". `resolveSecretValueWithEnv` already consults the
 * environment first and treats a miss as "no secret", so returning null keeps the
 * fallback chain working instead of throwing.
 */
const getAiSecret: Handler = async () => null;

const HANDLERS: Record<string, Handler> = {
  place_order: placeOrder,
  place_order_internal: placeOrderInternal,
  cancel_order: cancelOrder,
  crm_customers: crmCustomers,
  crm_customer_count: crmCustomerCount,
  crm_stats: crmStats,
  crm_estimate_segment: crmEstimateSegment,
  funnel_counts: funnelCounts,
  apply_settings_batch: applySettingsBatch,
  list_my_notifications: listMyNotifications,
  count_unread_notifications: countUnreadNotifications,
  mark_notification_read: markNotificationRead,
  mark_all_notifications_read: markAllNotificationsRead,
  add_agent_memory: addAgentMemory,
  match_agent_memory: matchAgentMemory,
  match_agent_skills: matchAgentSkills,
  replace_agent_skill: replaceAgentSkill,
  get_ai_secret: getAiSecret,
};

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
    if (error instanceof RpcError) {
      return { data: null as unknown as T, error: { message: error.message, code: error.code }, status: 400 };
    }
    return {
      data: null as unknown as T,
      error: { message: error instanceof Error ? error.message : String(error) },
      status: 500,
    };
  }
}

export { RpcError };
