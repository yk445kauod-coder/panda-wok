"use client";

/**
 * One shared read of the console's live data, for the whole tab.
 *
 * The console used to let every consumer poll on its own timer: the shell's
 * alert watcher ran on *every* page, and each board (orders list, kitchen) ran
 * its own poll on top of it. On the orders page that was two pollers hitting two
 * endpoints every 8 s — 15 Worker invocations a minute for one idle tab, ~20k a
 * day, and the Free plan's 100k/day budget is shared with the customer site.
 * Measured on the live account: 23,682 invocations on a single day for one admin.
 *
 * This module collapses that into a single poll for the whole tab. It owns:
 *
 *  - one timer, at one interval, paused while the document is hidden;
 *  - one `listPendingOrderAlertsAction` read, whose result every consumer shares;
 *  - one `panda-wok:refresh` dispatch on each tick, so pages that fetch their own
 *    JSON (`/api/admin/orders`, …) re-read on the *same* beat instead of a second
 *    timer.
 *
 * The interval is adaptive: once the `ops-orders` broadcast is confirmed live it
 * is the instant path and the poll is only a dropped-socket net, so it relaxes to
 * a minute; without a signal it is the only path and stays at the fast cadence.
 * `live` is read from the shared signal store at tick time, so a socket that
 * comes up late still relaxes the cadence without re-arming the timer.
 */

import { useEffect, useState } from "react";
import { listPendingOrderAlertsAction } from "@/lib/actions/order-alerts";
import type { OrderAlert } from "@/lib/services/admin-orders";
import { pendingSignature } from "@/lib/sound/alert-state";
import { getOpsLive, subscribeOpsSignal } from "@/lib/live/ops-socket";
import { startVisiblePoll } from "@/lib/live/visibility";

/**
 * Cadence when the socket is down — the poll is the only live path.
 *
 * This was 8 s, which assumed the socket rarely connects. It connects, so the
 * 8 s path is only ever reached when it drops, and 8 s was expensive: every tick
 * is one `listPendingOrderAlertsAction` invocation plus one re-fetch of any
 * `live: true` board, so two open admin tabs on a dropped socket cost ~43k
 * invocations a day — enough that a few admins sharing one tab each would exceed
 * the Free plan's 100k/day budget and the whole project (customer site included)
 * starts returning Error 1027. 30 s still recovers a dropped socket promptly
 * (the reconnect backoff is 1–30 s, so the socket is normally back long before
 * the first tick) while cutting the worst case to a quarter.
 */
export const OPS_POLL_FALLBACK_MS = 30000;
/** Safety-net cadence once the broadcast is confirmed live. */
export const OPS_POLL_LIVE_MS = 60000;

type Store = {
  pending: OrderAlert[];
  /** False until the first read lands, so a caller can seed from the server render. */
  loaded: boolean;
  subscribers: Set<() => void>;
};

let store: Store | null = null;
let stopPoll: (() => void) | null = null;
let inflight = false;

function ensureStore(): Store {
  if (!store) store = { pending: [], loaded: false, subscribers: new Set() };
  return store;
}

/**
 * Whether a read of the pending queue should also wake the opted-in boards
 * (`useAdminData` with `live: true`) on the shared `panda-wok:live` event.
 *
 * - `changed` — the pending set actually moved, so every board is stale.
 * - `forceBoards` — a realtime push, where something demonstrably changed.
 * - `!live` — the socket is down, so the poll is the *only* signal a board has;
 *   it must re-read on every tick or it would go stale between pushes that will
 *   never arrive.
 *
 * The one case this deliberately does not wake is an idle tick while live: the
 * push path covers real changes, and re-reading every board on a timer that
 * found nothing is the doubled invocation the budget cannot afford.
 */
export function shouldWakeBoards(state: {
  changed: boolean;
  forceBoards: boolean;
  live: boolean;
}): boolean {
  return state.changed || state.forceBoards || !state.live;
}

/**
 * One read of the pending-order list, shared by the poll and the push path.
 *
 * `forceBoards` is true on a realtime push, where something demonstrably
 * changed. On a poll tick it is false and the opted-in boards re-read only when
 * the pending queue actually moved — or whenever the socket is down, since then
 * the poll is the only signal and a board has no push to lean on. Without that
 * gate an idle dashboard on the live cadence paid a second Worker invocation
 * every minute — the tick's own read plus a board re-fetch — for a page that had
 * not changed. The alert watcher is unaffected: the store notifies it on every
 * tick.
 */
async function readPending(forceBoards = false): Promise<void> {
  if (inflight) return;
  inflight = true;
  try {
    const result = await listPendingOrderAlertsAction();
    if (result.ok && store) {
      const changed = pendingSignature(store.pending) !== pendingSignature(result.data);
      store.pending = result.data;
      store.loaded = true;
      for (const notify of store.subscribers) notify();
      if (shouldWakeBoards({ changed, forceBoards, live: getOpsLive() })) dispatchLive();
    }
  } finally {
    inflight = false;
  }
}

function dispatchLive(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("panda-wok:live"));
  }
}

/** Re-read the shared data now (a broadcast ping), coalescing bursts. */
let pingTimer: ReturnType<typeof setTimeout> | null = null;
export function refreshOpsNow(): void {
  if (typeof window === "undefined") return;
  if (pingTimer) clearTimeout(pingTimer);
  // One order action pings twice (the `orders` write and the history insert), so
  // coalesce the burst into one read instead of two Worker invocations.
  pingTimer = setTimeout(() => {
    pingTimer = null;
    void readPending(true);
  }, 300);
}

function tick(): void {
  // A tick is a poll, not a push: the boards re-read only if the queue moved.
  void readPending(false);
}

function startPolling(): void {
  if (stopPoll) return;
  void readPending();
  stopPoll = startVisiblePoll(tick, () => (getOpsLive() ? OPS_POLL_LIVE_MS : OPS_POLL_FALLBACK_MS));
}

function stopPollingIfIdle(): void {
  if (store && store.subscribers.size === 0 && stopPoll) {
    stopPoll();
    stopPoll = null;
  }
}

/**
 * The shared pending-order list, for the alert watcher and any banner.
 *
 * Returns `null` until the first read lands, so the caller can keep showing the
 * server render it was seeded with. Returning `[]` instead would be ambiguous:
 * "not loaded yet" and "loaded, nothing pending" would look the same, and the
 * caller could not tell an empty queue from a stale seed.
 */
export function useOpsPendingOrders(userId: string | null = null): OrderAlert[] | null {
  const [, force] = useState(0);
  useEffect(() => {
    const current = ensureStore();
    const notify = () => force((n) => n + 1);
    current.subscribers.add(notify);
    startPolling();
    // The push path: the hub tells us the moment an order changes. The poll
    // above is the net for a dropped socket, and it relaxes to a minute once
    // this reports `live`.
    const unsubscribe = subscribeOpsSignal(() => refreshOpsNow(), userId);
    return () => {
      unsubscribe();
      current.subscribers.delete(notify);
      stopPollingIfIdle();
    };
  }, [userId]);
  if (!store || !store.loaded) return null;
  return store.pending;
}
