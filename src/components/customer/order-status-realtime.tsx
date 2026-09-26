"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/components/i18n-provider";

/**
 * Subscribes to order_status_history inserts for one order and refreshes the
 * server component when a change lands. Realtime is treated as an
 * enhancement: on disconnect the component falls back to polling so a
 * customer never sits on a frozen screen.
 */
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
  const [lastEventAt, setLastEventAt] = useState<number>(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          if (cancelled) return;
          setLive(true);
          setLastEventAt(Date.now());
          router.refresh();
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
  }, [orderId, enabled, router]);

  // Polling safety net: only runs while realtime is not connected, and stops
  // entirely once the order reaches a terminal state (enabled=false upstream).
  useEffect(() => {
    if (!enabled || live) return;

    pollRef.current = setInterval(() => {
      if (Date.now() - lastEventAt > 20000) {
        router.refresh();
        setLastEventAt(Date.now());
      }
    }, 25000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [enabled, live, lastEventAt, router]);

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
