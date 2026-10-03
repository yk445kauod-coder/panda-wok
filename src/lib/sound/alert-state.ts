/**
 * Pure helpers behind the admin order alert. Kept free of React and of the
 * WebAudio layer so the "should this ring, and when does it stop" rules can be
 * unit-tested without a browser.
 *
 * The rule the kitchen asked for: an order alert rings loudly and does not stop
 * until somebody takes an action on it. Concretely, an alert is pending while an
 * order sits in the `new` stage; the moment its status moves to anything else
 * (accepted, rejected, cancelled, …) it is no longer pending and the siren
 * stops. "Acknowledge" is the local escape hatch for a member who has seen it
 * but cannot action the order.
 */

export type OrderAlert = {
  id: string;
  orderNumber: string;
  createdAt: string;
};

/** Order ids present now that were not present before. */
export function arrivedIds(previous: ReadonlySet<string>, current: readonly string[]): string[] {
  return current.filter((id) => !previous.has(id));
}

/**
 * A stable string of the pending set, used both as a change signature for the
 * poller and as the React dependency that re-evaluates the siren. Ordering is
 * normalised so a mere reshuffle of the same orders does not read as a change.
 */
export function pendingSignature(orders: readonly OrderAlert[]): string {
  return orders
    .map((order) => order.id)
    .sort()
    .join(",");
}

/** The siren is on exactly while there is an unacknowledged new order and sound is on. */
export function shouldRing(pendingCount: number, muted: boolean): boolean {
  return pendingCount > 0 && !muted;
}

/** Pending orders minus the ones this browser has already acknowledged. */
export function unacknowledgedOrders(
  orders: readonly OrderAlert[],
  acknowledged: ReadonlySet<string>,
): OrderAlert[] {
  return orders.filter((order) => !acknowledged.has(order.id));
}
