"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, BellOff, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n-provider";
import {
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
import { listPendingOrderAlertsAction } from "@/lib/actions/order-alerts";

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

  const [pending, setPending] = useState<OrderAlert[]>(initialPending);
  // The server render is the freshest truth on every navigation; mirror it.
  // This is React's documented "adjust state when a prop changes" pattern, done
  // during render rather than in an effect (which would be a lint error and a
  // cascading render).
  const [lastInitial, setLastInitial] = useState(initialPending);
  if (lastInitial !== initialPending) {
    setLastInitial(initialPending);
    setPending(initialPending);
  }

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

  const refresh = useCallback(async () => {
    const result = await listPendingOrderAlertsAction();
    if (result.ok) setPending(result.data);
  }, []);

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
  // context on the first gesture. Without this a poll-driven alarm is silent.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
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

  // Realtime nudge, plus a light poll and a refresh whenever the tab regains
  // focus. `visibilitychange` matters because a background tab throttles timers.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const channel = supabase
      .channel("admin-order-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        if (!cancelled) void refresh();
      })
      .subscribe();

    const interval = window.setInterval(() => void refresh(), 8000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

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
