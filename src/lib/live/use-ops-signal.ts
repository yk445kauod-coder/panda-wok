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
    .then(async ({ createClient }) => {
      // Everyone unmounted while the chunk was loading: do not open a socket.
      if (listeners.size === 0) return;
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (listeners.size === 0) return;

      const notify = () => {
        for (const listener of listeners) listener();
      };
      const onStatus = (status: string) => {
        if (status === "SUBSCRIBED") setLive(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLive(false);
        }
      };

      // With a session the row-level feed delivers the change itself, so a board
      // reacts to it directly. Without one (a mint failure, or the console
      // reached before the session cookie lands) the public broadcast still
      // delivers a content-free nudge and needs no `auth.uid()`.
      channel = data.session
        ? supabase
            .channel(OPS_CHANNEL)
            .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, notify)
            .on(
              "postgres_changes",
              { event: "INSERT", schema: "public", table: "order_status_history" },
              notify,
            )
            .subscribe(onStatus)
        : supabase
            .channel(OPS_CHANNEL)
            .on("broadcast", { event: OPS_EVENT }, notify)
            .subscribe(onStatus);
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
 * With a session the subscription is a real `postgres_changes` feed on `orders`
 * and `order_status_history`, so a board updates on push rather than on a timer.
 * The session is what makes that work: the staff RLS policies resolve through
 * `auth.uid()`, and the unlock action mints the session that provides it. If no
 * session is present the hook falls back to the public `ops-orders` broadcast,
 * which needs no session and carries a content-free ping; the caller then
 * re-reads through the gated `/api/admin/*` routes. No order data crosses that
 * broadcast.
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
