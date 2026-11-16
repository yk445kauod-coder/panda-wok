"use client";

/**
 * The console's live signal, backed by the ops hub instead of Supabase Realtime.
 *
 * This module used to open a Supabase Realtime channel. On the restricted project
 * Realtime never connected, so `live` was permanently false and every board fell
 * back to its fast poll — the behaviour that exhausted the Worker's daily
 * invocations. The public API is unchanged (`useOpsOrderSignal`, `getOpsLive`,
 * `subscribeOpsLive`) so the boards that consume it did not move; only the
 * transport did, from a socket that never opened to a Durable Object that does.
 *
 * The poll is still the net for a dropped socket, but `live` can now actually be
 * true, which is what lets it relax.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getOpsLive,
  subscribeOpsLive as subscribeSocketLive,
  subscribeOpsSignal,
} from "@/lib/live/ops-socket";

type Listener = () => void;
type LiveListener = () => void;

const listeners = new Set<Listener>();

/** Re-exported so non-React callers (the shared poller) keep one import path. */
export { getOpsLive };

export function subscribeOpsLive(listener: LiveListener): () => void {
  return subscribeSocketLive(listener);
}

const liveSnapshot = () => getOpsLive();
const liveServerSnapshot = () => false;

function subscribeLive(onStoreChange: LiveListener): () => void {
  const unsubscribe = subscribeSocketLive(onStoreChange);
  // Re-read on subscribe: the socket may have opened between render and effect.
  onStoreChange();
  return unsubscribe;
}

/**
 * Subscribes to the console's order-change signal and reports whether the hub
 * connection is live.
 *
 * `onChange`, if given, fires on every push. Pass it only where nothing else
 * already re-reads on the push (the alert watcher); a page that owns a board
 * should omit it, since the board re-reads and a second fetch would just double
 * the traffic.
 *
 * The returned flag is true while the socket is open and false if it drops, so a
 * caller may relax its poll on it — the relaxed poll remains the net for a socket
 * that dies between pushes.
 */
export function useOpsOrderSignal(onChange?: () => void): boolean {
  const isLive = useSyncExternalStore(subscribeLive, liveSnapshot, liveServerSnapshot);
  const changeRef = useRef(onChange);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const listener: Listener = () => changeRef.current?.();
    listeners.add(listener);
    // One socket per tab: the first consumer opens it and the last closes it.
    const unsubscribe = subscribeOpsSignal(() => {
      for (const notify of listeners) notify();
    });

    return () => {
      listeners.delete(listener);
      unsubscribe();
    };
  }, []);

  return isLive;
}
