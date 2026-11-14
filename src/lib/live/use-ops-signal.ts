"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** The public channel the `orders` triggers ping; see the ops_order_signal migration. */
const OPS_CHANNEL = "ops-orders";
const OPS_EVENT = "order_changed";

type Listener = () => void;
type LiveListener = () => void;

/**
 * One socket per tab, shared by every board that needs the signal.
 *
 * The alert watcher is mounted in the shell, so it runs on *every* console page
 * alongside whichever board that page owns; subscribing per-component would open
 * a socket for each. The first consumer connects and the last one disconnects.
 */
const listeners = new Set<Listener>();
const liveListeners = new Set<LiveListener>();
let channel: RealtimeChannel | null = null;
let connecting: Promise<void> | null = null;
let live = false;

function setLive(next: boolean): void {
  if (live === next) return;
  live = next;
  for (const listener of liveListeners) listener();
}

/**
 * Connect lazily, off the critical path.
 *
 * `@supabase/supabase-js` is one of the heaviest modules in the app (auth +
 * PostgREST + Realtime). The console needs only the Realtime half, and only for
 * a nudge that the poll already covers as its dependable path — but a static
 * import pulled the whole client into the first-load bundle of *every* admin
 * page, which is the bulk of the console's weight. A dynamic import keeps it in
 * its own chunk, so the shell paints and the poll starts before it arrives.
 */
function connect(): void {
  if (channel || connecting) return;
  connecting = import("@/lib/supabase/client")
    .then(({ createClient }) => {
      // Everyone unmounted while the chunk was loading: do not open a socket.
      if (listeners.size === 0) return;
      channel = createClient()
        .channel(OPS_CHANNEL)
        .on("broadcast", { event: OPS_EVENT }, () => {
          for (const listener of listeners) listener();
        })
        .subscribe((status: string) => {
          // Unlike the row-level subscription this replaces, a public broadcast
          // channel delivers as soon as it is subscribed — so SUBSCRIBED is a
          // real signal here, and lets an idle console relax its poll to the
          // safety net. A dropped socket flips it back so the poll resumes at
          // full rate.
          if (status === "SUBSCRIBED") setLive(true);
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setLive(false);
          }
        });
    })
    .catch(() => undefined)
    .finally(() => {
      connecting = null;
    });
}

function disconnect(): void {
  const current = channel;
  channel = null;
  setLive(false);
  if (current) {
    void import("@/lib/supabase/client").then(({ createClient }) => {
      void createClient().removeChannel(current);
    });
  }
}

const liveSnapshot = () => live;
const liveServerSnapshot = () => false;

/**
 * Subscribes to the console's order-change signal and reports whether the
 * channel is live.
 *
 * The gate is a cookie, not a Supabase session, so a `postgres_changes`
 * subscription on `orders` delivers nothing — the staff RLS policy resolves
 * through `auth.uid()`, which a cookie does not have, and the channel reports
 * SUBSCRIBED regardless. This listens to a *public broadcast* instead: the
 * trigger sends a content-free ping, an anonymous client can receive it, and the
 * caller re-reads through the gated `/api/admin/*` routes. No order data crosses
 * this channel.
 *
 * `onChange`, if given, fires on every ping. Pass it only where nothing else
 * already re-reads on the ping (the alert watcher, whose read is a server
 * action); a page that owns a board should omit it, since the board re-reads and
 * a second fetch would just double the traffic.
 *
 * The returned flag is true while the channel is subscribed and false if it
 * drops, so a caller may relax its poll on it — the relaxed poll remains the net
 * for a socket that dies between pings.
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
    connect();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) disconnect();
    };
  }, []);

  return isLive;
}

function subscribeLive(onStoreChange: LiveListener): () => void {
  liveListeners.add(onStoreChange);
  // Re-read on subscribe in case the channel went live between render and effect.
  onStoreChange();
  return () => {
    liveListeners.delete(onStoreChange);
  };
}
