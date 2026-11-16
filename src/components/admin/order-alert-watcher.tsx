"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, BellOff, Volume2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n-provider";
import { useOpsOrderSignal } from "@/lib/live/use-ops-signal";
import {
  isAudioUnlocked,
  isSoundEnabled,
  setSoundEnabled,
  soundServerSnapshot,
  startOrderAlarm,
  stopOrderAlarm,
  subscribeSound,
  unlockAudio,
} from "@/lib/sound/ting";
import {
  acknowledgeAll,
  ackServerSnapshot,
  ackSnapshot,
  subscribeAck,
} from "@/lib/sound/alert-ack";
import {
  arrivedIds,
  shouldRing,
  unacknowledgedOrders,
  type OrderAlert,
} from "@/lib/sound/alert-state";
import { refreshOpsNow, useOpsPendingOrders } from "@/lib/live/ops-sync";

/**
 * The console-wide new-order alert.
 *
 * It is mounted once in `AdminShell`, so it works on *every* admin page — the
 * operator does not have to be looking at the kitchen board to hear an order
 * arrive. Two things drive it:
 *
 *  - realtime, for an instant nudge when the `orders` table changes; and
 *  - a poll (every 8 s), which is the dependable path when the socket is down.
 *
 * When an order is sitting in `new` and this browser has not acknowledged it,
 * the siren rings loudly and repeats — it does not stop on its own. It stops
 * the moment the order leaves `new` (someone accepted or rejected it), the
 * operator presses Acknowledge, or the console is muted. The same state also
 * drives a fixed alert bar, a flashing document title and a toast.
 */
export function OrderAlertWatcher({
  initialPending,
}: {
  initialPending: OrderAlert[];
}) {
  const toast = useToast();
  const t = useT();

  // The shared store owns the read and the single tab-wide poll; the server
  // render is the seed, and `useOpsPendingOrders` takes over from the first tick.
  // `initialPending` still wins for the very first paint so the shell renders the
  // alert without waiting a poll.
  //
  // `AdminApp` seeds the store from the same list as soon as the session lands,
  // before this mounts — so the store is already loaded and its opening read is
  // skipped. A page load costs one read of the queue, not two.
  const shared = useOpsPendingOrders();
  const [seed] = useState(initialPending);
  const pending = shared ?? seed;

  const sound = useSyncExternalStore(subscribeSound, isSoundEnabled, soundServerSnapshot);
  const ackSig = useSyncExternalStore(subscribeAck, ackSnapshot, ackServerSnapshot);

  const acknowledged = useMemo(
    () => new Set(ackSig ? ackSig.split(",").filter(Boolean) : []),
    [ackSig],
  );
  const unacked = useMemo(
    () => unacknowledgedOrders(pending, acknowledged),
    [pending, acknowledged],
  );
  const ringing = shouldRing(unacked.length, !sound);

  // Ids we have already announced, so a re-render or a poll does not re-toast
  // or re-notify the same order.
  const announced = useRef<Set<string>>(new Set());
  const seeded = useRef(false);


  // Announce genuinely new orders once: toast, and a desktop notification if
  // the operator already granted permission (we never prompt on our own).
  useEffect(() => {
    const ids = pending.map((order) => order.id);
    if (!seeded.current) {
      seeded.current = true;
      announced.current = new Set(ids);
      return;
    }
    const added = arrivedIds(announced.current, ids);
    announced.current = new Set(ids);
    if (added.length === 0) return;

    const first = pending.find((order) => order.id === added[0]);
    toast.success(
      added.length === 1
        ? t("kds.newTicket")
        : t("kds.newTickets", { count: added.length }),
    );

    if (typeof window !== "undefined" && "Notification" in window) {
      if (window.Notification.permission === "granted") {
        try {
          new window.Notification(t("kds.newTicket"), {
            body: first ? `#${first.orderNumber}` : undefined,
            tag: "panda-wok-order",
          });
        } catch {
          // Some browsers throw when the page is not focused; the siren and the
          // banner still carry the alert, so this is safe to swallow.
        }
      }
    }
  }, [pending, toast, t]);

  // The siren itself. Starting is idempotent, so a new arrival while it is
  // already ringing does not restart it; it stops the moment `ringing` is false.
  useEffect(() => {
    if (ringing) startOrderAlarm();
    else stopOrderAlarm();
    return () => stopOrderAlarm();
  }, [ringing]);

  // Autoplay policy blocks audio until the visitor interacts, so resume the
  // context on the console's first gestures. The gate submit that unlocks the
  // console is a gesture and this component mounts right after it (the form no
  // longer reloads, which used to drop the activation), so the immediate
  // `unlockAudio()` usually succeeds; the listeners below are the fallback for a
  // browser that still refuses, and they keep trying — across pointer *and*
  // touch — until the context is actually running rather than giving up after
  // one attempt. Without this, a returning operator who unlocks and only watches
  // the board never makes a sound.
  useEffect(() => {
    unlockAudio();
    const unlock = () => {
      unlockAudio();
      if (isAudioUnlocked()) detach();
    };
    // Safari interrupts the audio session when the page is backgrounded or the
    // phone locks, and it does not resume on its own — a console left on a
    // counter overnight would come back silent. Re-assert on every return to the
    // foreground.
    const onVisible = () => {
      if (document.visibilityState === "visible") unlockAudio();
    };
    const detach = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      document.removeEventListener("visibilitychange", onVisible);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    document.addEventListener("visibilitychange", onVisible);
    return detach;
  }, []);

  // Flash the tab title while an order is unacknowledged, so a backgrounded
  // console still reads as "something needs you".
  useEffect(() => {
    if (unacked.length === 0) return;
    const base = document.title;
    let on = false;
    const id = window.setInterval(() => {
      on = !on;
      document.title = on ? `🔔 (${unacked.length}) ${base}` : base;
    }, 900);
    return () => {
      window.clearInterval(id);
      document.title = base;
    };
  }, [unacked.length]);

  // Realtime: an instant nudge the moment the `orders` table changes. This
  // listens to the public `ops-orders` broadcast rather than `postgres_changes`:
  // the gate is a cookie, not a Supabase session, so a row-level subscription
  // delivers nothing (the staff RLS policy resolves through `auth.uid()`) yet
  // still reports SUBSCRIBED. The broadcast carries no row data and needs no
  // session, so it actually arrives. The store does the read; the signal only
  // marks liveness and lets the store relax its poll to a safety net.
  // Signal only; the store owns the read and the poll cadence.
  useOpsOrderSignal(refreshOpsNow);

  if (unacked.length === 0) return null;

  const label =
    unacked.length === 1
      ? t("kds.alertTitle", { count: unacked.length })
      : t("kds.alertTitlePlural", { count: unacked.length });

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border-b border-rice-50/20 bg-vermilion-600 text-rice-50 shadow-lg"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4 lg:px-8">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-rice-50/15">
          <Bell className="size-5 animate-pulse" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-2xs text-rice-100/85">
            {sound ? t("kds.alertHint") : t("kds.alertMuted")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unacked.slice(0, 3).map((order) => (
            <Link
              key={order.id}
              href={`/admin/orders/${order.id}`}
              onClick={() => acknowledgeAll([order.id])}
              className="inline-flex h-8 items-center rounded-lg bg-rice-50/15 px-2.5 text-xs font-semibold tabular-nums hover:bg-rice-50/25"
            >
              #{order.orderNumber}
            </Link>
          ))}
          {unacked.length > 3 ? (
            <span className="text-xs text-rice-100/80">+{unacked.length - 3}</span>
          ) : null}

          {!sound ? (
            <button
              type="button"
              onClick={() => setSoundEnabled(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rice-50 px-2.5 text-xs font-semibold text-vermilion-700 hover:bg-rice-100"
            >
              <Volume2 className="size-3.5" aria-hidden="true" />
              {t("kds.soundOn")}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              acknowledgeAll(unacked.map((order) => order.id));
              stopOrderAlarm();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-950 px-3 text-xs font-semibold text-rice-50 hover:bg-ink-900"
          >
            <BellOff className="size-3.5" aria-hidden="true" />
            {t("kds.acknowledge")}
          </button>
        </div>
      </div>
    </div>
  );
}
