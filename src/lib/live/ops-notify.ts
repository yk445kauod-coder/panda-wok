/**
 * Tell the console an order changed, right after it did.
 *
 * This is the write half of the live hub. The console no longer polls every
 * eight seconds; it holds one WebSocket and this is what makes it move. Called
 * from the two places an order changes — a customer placing one and staff
 * changing its status — so every open console hears about it in the same tick.
 *
 * Two things it must never do: fail the write it is reporting, and delay it.
 * The hub call is fired and forgotten (`publishOpsEvent` uses `waitUntil`), and a
 * hub that is down leaves the poll as the fallback, which is exactly the state
 * the console was in before.
 */

import "server-only";

import { getCloudflareBindings } from "@/lib/d1/database";
import { publishOpsEvent } from "@/lib/live/ops-publish";

type WaitUntilContext = { waitUntil(promise: Promise<unknown>): void };

/**
 * The hub binding, or `null` when this deployment has no hub.
 *
 * Deliberately not gated on the data backend: the console's live socket is the
 * hub in both modes, so whichever database wrote the order has to publish to it.
 * Gating this on D1 would leave a Supabase-backed console with a socket that
 * never rings — the exact silent-failure shape that caused the original bug.
 */
function hubContext(): { env: unknown; ctx: WaitUntilContext | null } | null {
  const env = getCloudflareBindings();
  if (!env.OPS_HUB && !env.OPS_HUB_URL) return null;
  return { env, ctx: null };
}

/**
 * Publish `order.created` / `order.updated` for one order.
 *
 * Returns immediately; the fetch happens in the background.
 */
export function publishOrderChange(
  kind: "order.created" | "order.updated",
  orderId: string,
  ctx?: WaitUntilContext | null,
): void {
  const hub = hubContext();
  if (!hub) return;
  // No ids: the hub's socket is public, and a console re-reads through the
  // gated admin routes anyway, so the id would only leak which orders exist.
  // The argument is kept because the caller knows it and a future per-customer
  // channel will be entitled to it.
  void orderId;
  publishOpsEvent(hub.env, ctx ?? hub.ctx, {
    kind,
    table: "orders",
    audience: "console",
  });
}
