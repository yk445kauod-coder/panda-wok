"use server";

import { assertCapability } from "@/lib/auth/session";
import { getPendingNewOrders, type OrderAlert } from "@/lib/services/admin-orders";
import { actionError, actionOk, type ActionResult } from "@/lib/actions/result";

/**
 * The polling source behind the console-wide order alert. The watcher calls this
 * every few seconds; realtime gives an instant nudge on top, but this is the
 * dependable path when the socket is unavailable. Gated on `orders.view`, so a
 * role that cannot see orders never receives one over the wire.
 */
export async function listPendingOrderAlertsAction(): Promise<ActionResult<OrderAlert[]>> {
  try {
    await assertCapability("orders.view");
    return actionOk(await getPendingNewOrders());
  } catch (error) {
    return actionError(error);
  }
}
