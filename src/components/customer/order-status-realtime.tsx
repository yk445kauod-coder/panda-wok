"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/components/i18n-provider";

/**
 * Keeps an order page current.
 *
 * Realtime (a `postgres_changes` insert on `order_status_history`) is the fast
 * path, but it is treated strictly as an enhancement: polling runs the whole
 * time the order is active, not only when the socket is down. That matters
 * because a subscription can report `SUBSCRIBED` while delivering nothing — an
 * empty `supabase_realtime` publication did exactly that, so the old code
 * switched polling off and the page froze until a manual refresh. With polling
 * always on, the worst case is one poll interval, whatever the socket claims.
 */
const POLL_MS = 15000;

export function OrderStatusRealtime({
  orderId,
  enabled,
}: {
  orderId: string;
  enabled: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [live, setLive] = useState(false);
  const refreshing = useRef(false);

  const refresh = () => {
    if (refreshing.current) return;
    refreshing.current = true;
    router.refresh();
    // The server render replaces the tree; clear the guard shortly after so a
    // slow render cannot block every later poll.
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

  // Always poll while the order is active. Realtime usually beats this to it;
  // the poll is what guarantees the page cannot silently stall.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
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
