"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startVisiblePoll } from "@/lib/live/visibility";
import { useT } from "@/components/i18n-provider";

/**
 * Keeps an order page current.
 *
 * Realtime (a `postgres_changes` insert on `order_status_history`) is the fast
 * path. The tracking page is behind sign-in, so the browser holds a Supabase
 * session and the row-level subscription actually delivers — the policy scopes
 * it to this customer's own order, so no other order is visible over the socket.
 *
 * Polling still runs while the order is active, as a safety net rather than the
 * main path: a subscription can report `SUBSCRIBED` while delivering nothing (an
 * empty `supabase_realtime` publication did exactly that, so the old code
 * switched polling off and the page froze until a manual refresh). With polling
 * always on, the worst case is one poll interval, whatever the socket claims.
 * The interval is long because the socket is expected to win; it only has to
 * catch a socket that died.
 */
const POLL_MS = 120000;

export function OrderStatusRealtime({
  orderId,
  enabled,
  onRefresh,
}: {
  orderId: string;
  enabled: boolean;
  /** Re-read the order. The page passes its client-store `reload`, not a router
   *  refresh: the route is a static shell now, so `router.refresh()` would
   *  re-render the same static document and never show the new status. */
  onRefresh: () => void;
}) {
  const t = useT();
  const [live, setLive] = useState(false);
  const refreshing = useRef(false);

  // The callback is kept in a ref: the page passes an inline arrow, and a
  // subscription effect that depended on it would tear down the channel on
  // every render.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  const refresh = () => {
    if (refreshing.current) return;
    refreshing.current = true;
    onRefreshRef.current();
    // Clear the guard shortly after so a slow read cannot block every later
    // poll.
    window.setTimeout(() => {
      refreshing.current = false;
    }, 4000);
  };

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    let cancelled = false;

    const channel = supabase
      .channel(`order-status-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_status_history",
          filter: `order_id=eq.${orderId}`,
        },
        () => {
          if (!cancelled) refresh();
        },
      )
      .subscribe((status: string) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") setLive(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLive(false);
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [orderId, enabled]);

  // Always poll while the order is active, but only while the tab is visible.
  // Realtime usually beats this to it; the poll is what guarantees the page
  // cannot silently stall. A backgrounded tab cannot be watched, so polling it
  // is pure cost — each tick is a Worker invocation, and a phone left on the
  // tracking page would otherwise spend the request budget the whole project
  // shares. `startVisiblePoll` clears the timer while hidden and catches up once
  // on return.
  useEffect(() => {
    if (!enabled) return;
    return startVisiblePoll(refresh, POLL_MS);
  }, [enabled]);

  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-700/65">
      <span
        aria-hidden="true"
        className={
          live ? "size-1.5 rounded-full bg-jade-500" : "size-1.5 rounded-full bg-miso-500"
        }
      />
      {live ? t("orders.liveUpdating") : t("orders.polling")}
    </p>
  );
}
