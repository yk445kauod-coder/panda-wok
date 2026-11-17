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
 *  - one `GET /api/admin/alerts` read, whose result every consumer shares;
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
import type { OrderAlert } from "@/lib/services/admin-orders";
import { pendingSignature } from "@/lib/sound/alert-state";
import { getOpsLive, subscribeOpsSignal } from "@/lib/live/ops-socket";
import { startVisiblePoll } from "@/lib/live/visibility";

/**
 * Cadence when the socket is down — the poll is the only live path.
 *
 * This was 8 s, which assumed the socket rarely connects. It connects (verified
 * live against the hub), so the 8 s path is only ever reached when it drops. A
 * tick is one read of the alert endpoint plus, if the queue moved, one re-fetch
 * of any `live: true` board; on a dropped socket that is the only way a board
 * learns anything, so the cadence is the worst-case new-order latency for as
 * long as the outage lasts.
 *
 * 60 s is the balance: the socket reconnects on a 1–30 s backoff, so it is
 * normally back well before the first tick, and 60 s keeps the outage window
 * short enough to still read as "live" in a kitchen while cutting a dropped
 * socket's worst case to a fraction of the old 8 s.
 */
export const OPS_POLL_FALLBACK_MS = 60000;
/**
 * Safety-net cadence once the broadcast is confirmed live.
 *
 * When the socket is up it is the real path and this poll exists for one case
 * only: a socket that reports open but has silently stopped delivering. A dead
 * socket is caught by `onclose` (the 25 s heartbeat surfaces it within a tick or
 * two) and drops to the fallback cadence, so this net is rarely the thing that
 * matters — which is why it can be long. Five minutes keeps a zombie socket's
 * worst case bounded without paying a Worker invocation a minute for a page that
 * is already being pushed to.
 */
export const OPS_POLL_LIVE_MS = 300000;

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
 * Seeds the shared store from the queue `/api/admin/session` already returned.
 *
 * The session payload and the alert endpoint return the same list, and the shell
 * fetches the session on every page load. Seeding here means the tab's first read
 * of the queue is the one it already paid for, and the poll's opening read is
 * skipped — one Worker invocation per console page load instead of two.
 *
 * It overwrites rather than only seeding once: after a lock the shell unmounts
 * and the poll stops, so on the next unlock the store still holds the list from
 * before the lock. The fresh session payload is the newer truth, and the watcher
 * reads `shared ?? seed` — an early return here would keep showing the stale one.
 * A read that lands afterwards still replaces it, so the seed is never the last
 * word.
 */
export function seedOpsPending(orders: OrderAlert[]): void {
  const current = ensureStore();
  current.pending = orders;
  current.loaded = true;
  for (const notify of current.subscribers) notify();
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
 * It is a plain GET to `/api/admin/alerts`, not a Server Action. An action is a
 * POST back to the page the console is on, and every console route is a static
 * shell — so the read arrived as a POST that had no handler (404), forced the
 * App Router to re-emit a static document (200), or blew the Free plan's 10 ms
 * CPU cap (503, Error 1102). Measured over one week: 4,028 such POSTs against 48
 * orders in the database. A GET route is one cheap invocation and one indexed
 * read, and a 401/403 means the gate expired — the same `panda-wok:locked`
 * hand-off the page reads use.
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
async function readPending(forceBoards = false): Promise<boolean> {
  // A read already in flight is neither a success nor a failure: report `true`
  // so the poll cadence is not backed off for a tick it simply coalesced into.
  if (inflight) return true;
  inflight = true;
  try {
    const response = await fetch("/api/admin/alerts", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("panda-wok:locked"));
      }
      // An expired gate is a deliberate stop, not a transient failure, so it
      // must not back the poll off — the user is being redirected to unlock.
      return true;
    }
    if (!response.ok) return false;
    const payload = (await response.json()) as { ok: boolean; data?: OrderAlert[] };
    if (!payload.ok || !store) return false;
    const next = payload.data ?? [];
    const changed = pendingSignature(store.pending) !== pendingSignature(next);
    store.pending = next;
    store.loaded = true;
    for (const notify of store.subscribers) notify();
    if (shouldWakeBoards({ changed, forceBoards, live: getOpsLive() })) dispatchLive();
    return true;
  } catch {
    // A dropped read is not a reason to tear the console down: the poll helper
    // backs the next tick off, and the socket (or the next tick) retries. The
    // boards keep whatever they last had.
    return false;
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

function tick(): Promise<boolean> {
  // A tick is a poll, not a push: the boards re-read only if the queue moved.
  // The result flows back to `startVisiblePoll`, which backs the cadence off on
  // a failed read.
  return readPending(false);
}

function startPolling(): void {
  if (stopPoll) return;
  // `/api/admin/session` already returned the pending queue in the same page
  // load, so the store is normally seeded before this runs. Reading again here
  // would be a second Worker invocation for data the tab is holding — the
  // page-load cost would be two reads of the same list instead of one.
  if (!store?.loaded) void readPending();
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
