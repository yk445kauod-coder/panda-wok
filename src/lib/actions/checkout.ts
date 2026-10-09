"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { placeOrderSchema } from "@/lib/validation/schemas";
import {
  actionError,
  actionFail,
  actionOk,
  type ActionResult,
} from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";

export type PlacedOrder = {
  orderId: string;
  orderNumber: string;
  total: number;
  /** True when an identical submission was already stored (safe retry). */
  reused: boolean;
};

/**
 * Submits an order. All pricing, availability, stock and address validation
 * happens inside the place_order database function; this action only shapes
 * input and guarantees the caller is authenticated. The idempotency key is
 * generated once per checkout attempt on the client and reused on retry, so a
 * double tap or a flaky network cannot create two orders.
 */
export async function placeOrderAction(
  input: unknown,
): Promise<ActionResult<PlacedOrder>> {
  const session = await requireUser("/checkout");

  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    // A locally-rejected payload is a validation failure, not a retryable
    // server error: surface it with the VALIDATION code so the UI shows field
    // guidance rather than "something went wrong".
    return actionFail("VALIDATION", parsed.error.issues[0]?.message);
  }

  const supabase = await createServerSupabase();
  const v = parsed.data;

  const { data, error } = await supabase.rpc("place_order", {
    p_idempotency_key: v.idempotencyKey,
    p_items: v.items.map((line) => ({
      menu_item_id: line.menuItemId,
      quantity: line.quantity,
      modifiers: line.modifiers,
      notes: line.notes ?? null,
    })),
    p_address_id: v.addressId ?? undefined,
    p_fulfillment: v.fulfillment,
    p_payment_method: v.paymentMethod,
    p_customer_note: v.customerNote ?? undefined,
    p_points_redeem: v.pointsToRedeem,
  });

  if (error) {
    // The database rejects with a stable machine code; map it in the UI layer.
    return actionError(new Error(error.message));
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.order_id) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "The order could not be created." },
    };
  }

  if (!row.reused) {
    await logActivity(supabase, {
      userId: session.user.id,
      event: "ORDER_CREATED",
      entity: "orders",
      entityId: row.order_id,
      metadata: { total: Number(row.total) },
    });
  }

  revalidatePath("/account");
  revalidatePath("/orders");

  return actionOk({
    orderId: row.order_id,
    orderNumber: row.order_number,
    total: Number(row.total),
    reused: Boolean(row.reused),
  });
}

/**
 * Customer-initiated cancellation.
 *
 * Cancellation goes through the `cancel_order` RPC, **not** a plain `.update()`.
 * `orders` has no customer UPDATE policy (only `orders_staff_update`), and under
 * RLS an UPDATE that no policy admits matches zero rows while PostgREST still
 * returns 204 with no error, so the old `.update()` reported success and
 * cancelled nothing. A policy would also be too blunt: RLS cannot restrict
 * columns, so it would let a customer rewrite `total` or `points_redeemed`. The
 * definer RPC checks ownership and the `new`/`accepted` window, and writes only
 * the cancellation fields.
 */
export async function cancelOrderAction(
  orderId: string,
): Promise<ActionResult<undefined>> {
  const session = await requireUser("/orders");
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });

  if (error) {
    // The RPC raises a SQLSTATE rather than returning a row, so map the ones the
    // customer can actually act on and let `toAppError` handle the rest.
    const code =
      error.code === "22023"
        ? "FORBIDDEN"
        : error.code === "P0002"
          ? "ITEM_NOT_FOUND"
          : undefined;

    if (code === "FORBIDDEN") {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message:
            "This order is already being prepared, so it can no longer be canceled. Please contact the kitchen.",
        },
      };
    }
    if (code === "ITEM_NOT_FOUND") {
      return {
        ok: false,
        error: { code: "ITEM_NOT_FOUND", message: "We could not find that order." },
      };
    }
    return actionError(error);
  }

  await logActivity(supabase, {
    userId: session.user.id,
    event: "ORDER_CANCELED",
    entity: "orders",
    entityId: orderId,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/account");
  return actionOk();
}
