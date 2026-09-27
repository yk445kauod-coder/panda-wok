"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Bell, BellOff, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n-provider";
import {
  setSoundEnabled,
  playTing,
  subscribeSound,
  soundServerSnapshot,
  isSoundEnabled,
} from "@/lib/sound/ting";
import { cn } from "@/lib/utils/format";

/**
 * The kitchen board's live behaviour, extracted from the server page so the
 * board can animate.
 *
 * Ticket movement is announced rather than re-rendered blindly: when a poll or
 * a realtime event brings new state, the changed tickets are diffed, the board
 * cross-fades the affected columns, and a genuinely new ticket rings the
 * "ting ting" chime and raises a toast. The chime only fires for arrivals, so
 * moving a ticket along does not make the kitchen listen to noise all day.
 *
 * A KDS is an always-on screen, so this is the one admin surface that polls
 * aggressively when realtime is unavailable (12s rather than the 30s default).
 */
export function KitchenLiveBoard({
  children,
  signature,
  freshCount,
}: {
  children: React.ReactNode;
  /** A stable string of order ids per column; a change means a re-fetch happened. */
  signature: string;
  freshCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [live, setLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState(false);
  // The sound preference lives outside React so it survives a refresh and can be
  // read during SSR without a hydration mismatch; useSyncExternalStore is the
  // supported way to subscribe to it without a seeding effect.
  const sound = useSyncExternalStore(subscribeSound, isSoundEnabled, soundServerSnapshot);

  // Previous state is kept in a ref: comparing against it must not itself
  // trigger a render, and the first mount must seed it without ringing.
  const seen = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const lastSync = useRef(0);

  const refresh = useCallback(() => {
    setRefreshing(true);
    lastSync.current = Date.now();
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 500);
  }, [router]);

  // Diff the current signature against what we have seen. A brand new order id
  // is an arrival: ring, toast, and pulse the header.
  useEffect(() => {
    const ids = signature ? signature.split(",").filter(Boolean) : [];
    const next = new Set(ids);

    if (!seeded.current) {
      seeded.current = true;
      seen.current = next;
      return;
    }

    const added = ids.filter((id) => !seen.current.has(id));
    seen.current = next;
    if (added.length === 0) return;

    playTing();
    setFlash(true);
    toast.success(
      added.length === 1
        ? t("kds.newTicket")
        : t("kds.newTickets", { count: added.length }),
    );
    window.setTimeout(() => setFlash(false), 900);
  }, [signature, toast, t]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const channel = supabase
      .channel("kds-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        if (!cancelled) refresh();
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_status_history" },
        () => {
          if (!cancelled) refresh();
        },
      )
      .subscribe((status: string) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") setLive(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLive(false);
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Seed the sync clock on mount (outside render) so the first poll waits its
  // full interval rather than firing immediately.
  useEffect(() => {
    lastSync.current = Date.now();
  }, []);

  useEffect(() => {
    if (live) return;
    const interval = setInterval(() => {
      if (Date.now() - lastSync.current > 9000) refresh();
    }, 12000);
    return () => clearInterval(interval);
  }, [live, refresh]);

  return (
    <div className="kds-board space-y-4">
      <div
        className={cn(
          "flex flex-wrap items-center justify-end gap-2 transition-colors",
          flash && "text-vermilion-700",
        )}
      >
        <p className="flex items-center gap-1.5 text-xs text-ink-700/70">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              live ? "animate-pulse-soft bg-jade-500" : "bg-miso-500",
            )}
          />
          {live ? t("kds.live") : t("kds.polling")}
        </p>
        <span className="text-xs text-ink-700/60">
          {t("kds.openTickets", { count: freshCount })}
        </span>
        <button
          type="button"
          onClick={() => setSoundEnabled(!sound)}
          aria-pressed={sound}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-900/12 px-2.5 text-xs text-ink-700 transition-colors hover:bg-rice-100"
        >
          {sound ? (
            <Bell className="size-3.5" aria-hidden="true" />
          ) : (
            <BellOff className="size-3.5" aria-hidden="true" />
          )}
          {sound ? t("kds.soundOn") : t("kds.soundOff")}
        </button>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-900/12 px-2.5 text-xs text-ink-700 transition-colors hover:bg-rice-100"
        >
          <RefreshCw
            className={cn("size-3.5", refreshing && "animate-spin")}
            aria-hidden="true"
          />
          {t("kds.refresh")}
        </button>
      </div>

      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  );
}

/**
 * One ticket. Wrapped in `motion.li` so it eases in when it lands and out when
 * it leaves a column, and so a re-order inside a column is a smooth slide
 * instead of a jump. The layout prop is what makes the reflow animated.
 */
export function KitchenTicket({
  children,
  highlighted = false,
}: {
  children: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "kds-ticket rounded-xl border bg-rice-50 p-3",
        highlighted
          ? "border-vermilion-500/50 ring-1 ring-vermilion-500/25"
          : "border-ink-900/10",
      )}
    >
      {children}
    </motion.li>
  );
}

/** A column that cross-fades its contents when the running order changes. */
export function KitchenColumn({
  label,
  count,
  accent,
  children,
}: {
  label: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className={cn("washi-panel flex flex-col border-t-4 p-3", accent)}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="font-display text-sm font-semibold text-ink-900">{label}</h2>
        <span className="grid min-w-6 place-items-center rounded-full bg-ink-900/6 px-1.5 text-xs font-semibold tabular-nums text-ink-800">
          {count}
        </span>
      </div>
      <ul className="ops-scroll space-y-2">{children}</ul>
    </section>
  );
}

