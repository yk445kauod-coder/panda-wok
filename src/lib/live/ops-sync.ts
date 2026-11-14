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
import { getOpsLive } from "@/lib/live/use-ops-signal";
import { startVisiblePoll } from "@/lib/live/visibility";

/** Fast cadence when the signal is down — the poll is the only live path. */
export const OPS_POLL_FALLBACK_MS = 8000;
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

async function readPending(): Promise<void> {
  if (inflight) return;
  inflight = true;
  try {
    const result = await listPendingOrderAlertsAction();
    if (result.ok && store) {
      store.pending = result.data;
      store.loaded = true;
      for (const notify of store.subscribers) notify();
    }
  } finally {
    inflight = false;
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
    tick();
  }, 300);
}

function tick(): void {
  void readPending();
  // The one shared beat: the shell's timer and every realtime ping both land
  // here. `panda-wok:live` re-reads only the boards that opted in (`useAdminData`
  // with `live: true`); a settings or exports page in the same tab stays quiet.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("panda-wok:live"));
  }
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
export function useOpsPendingOrders(): OrderAlert[] | null {
  const [, force] = useState(0);
  useEffect(() => {
    const current = ensureStore();
    const notify = () => force((n) => n + 1);
    current.subscribers.add(notify);
    startPolling();
    return () => {
      current.subscribers.delete(notify);
      stopPollingIfIdle();
    };
  }, []);
  if (!store || !store.loaded) return null;
  return store.pending;
}
