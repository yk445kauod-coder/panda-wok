import type { Database } from "@/lib/types/database";

/**
 * Order workflow rules, kept free of server-only imports so both the server
 * action and the client status control can reason about the same state machine
 * from one definition. Anything touching the database lives in order-status.ts.
 */

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export const ORDER_STATUS_FLOW: readonly OrderStatus[] = [
  "new",
  "accepted",
  "in_progress",
  "prepared",
  "out_for_delivery",
  "finished",
] as const;

export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "finished",
  "canceled",
  "rejected",
  "failed",
  "refunded",
] as const;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Order received",
  accepted: "Kitchen accepted",
  in_progress: "Preparing your food",
  prepared: "Prepared and packed",
  out_for_delivery: "On the way",
  finished: "Delivered",
  canceled: "Canceled",
  rejected: "Rejected",
  failed: "Failed",
  refunded: "Refunded",
};

/** Customer-facing explanation for each step, used on the tracking timeline. */
export const ORDER_STATUS_HINTS: Record<OrderStatus, string> = {
  new: "We have your order and the kitchen is about to review it.",
  accepted: "The kitchen has accepted your order and will start soon.",
  in_progress: "Your food is being cooked to order right now.",
  prepared: "Everything is packed and waiting for the rider.",
  out_for_delivery: "Your order has left the kitchen.",
  finished: "Delivered. Enjoy your food.",
  canceled: "This order was canceled.",
  rejected: "The kitchen could not accept this order.",
  failed: "Something went wrong with this order.",
  refunded: "This order was refunded.",
};

/** Valid next states from a given state, so no invalid jump can be submitted. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ["accepted", "rejected", "canceled", "failed"],
  accepted: ["in_progress", "canceled", "failed"],
  in_progress: ["prepared", "canceled", "failed"],
  prepared: ["out_for_delivery", "canceled", "failed"],
  out_for_delivery: ["finished", "failed", "refunded"],
  finished: ["refunded"],
  canceled: [],
  rejected: [],
  failed: ["refunded"],
  refunded: [],
};

export function isTerminal(status: OrderStatus) {
  return TERMINAL_STATUSES.includes(status);
}

export function isActive(status: OrderStatus) {
  return !isTerminal(status);
}

export function allowedTransitions(status: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS[status] ?? [];
}

/**
 * The customer-facing timeline. Terminal failures collapse to a single
 * explanatory state instead of showing a broken progress bar.
 */
export type TimelineStep = {
  status: OrderStatus;
  label: string;
  hint: string;
  state: "done" | "current" | "upcoming" | "failed";
  at: string | null;
};

export function buildTimeline(
  status: OrderStatus,
  history: { to_status: OrderStatus; created_at: string }[],
  isPickup = false,
): TimelineStep[] {
  const flow = ORDER_STATUS_FLOW.filter(
    (s) => !(isPickup && s === "out_for_delivery"),
  );
  const reachedAt = new Map<OrderStatus, string>();
  for (const entry of history) {
    if (!reachedAt.has(entry.to_status)) reachedAt.set(entry.to_status, entry.created_at);
  }

  if (TERMINAL_STATUSES.includes(status) && status !== "finished") {
    const reachedIndex = flow.findIndex((s) => reachedAt.has(s));
    const done = flow.slice(0, Math.max(reachedIndex + 1, 0));
    return [
      ...done.map((s) => ({
        status: s,
        label: ORDER_STATUS_LABELS[s],
        hint: ORDER_STATUS_HINTS[s],
        state: "done" as const,
        at: reachedAt.get(s) ?? null,
      })),
      {
        status,
        label: ORDER_STATUS_LABELS[status],
        hint: ORDER_STATUS_HINTS[status],
        state: "failed" as const,
        at: reachedAt.get(status) ?? null,
      },
    ];
  }

  const currentIndex = flow.indexOf(status);
  return flow.map((s, index) => {
    const state: TimelineStep["state"] =
      index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
    return {
      status: s,
      label: ORDER_STATUS_LABELS[s],
      hint: ORDER_STATUS_HINTS[s],
      state,
      at: reachedAt.get(s) ?? null,
    };
  });
}
