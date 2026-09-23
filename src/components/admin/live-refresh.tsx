"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/format";

/**
 * Keeps an ops board live. Subscribes to every order status change and new
 * order, then refreshes the server component. Realtime is treated as an
 * enhancement: if the socket never connects, or drops, the board falls back to
 * polling so the pass never shows a stale ticket.
 */
export function LiveOrdersFeed({
  label = "Live",
  pollSeconds = 30,
}: {
  label?: string;
  pollSeconds?: number;
}) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<number>(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setLastSync(Date.now());
    router.refresh();
    // The server component streams in; clear the spinner once the frame settles.
    window.setTimeout(() => setRefreshing(false), 600);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const channel = supabase
      .channel("admin-orders-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          if (!cancelled) refresh();
        },
      )
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

  useEffect(() => {
    if (live) return;
    pollRef.current = setInterval(() => {
      if (Date.now() - lastSync > (pollSeconds - 5) * 1000) refresh();
    }, pollSeconds * 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [live, lastSync, pollSeconds, refresh]);

  return (
    <div className="flex items-center gap-2">
      <p className="flex items-center gap-1.5 text-xs text-ink-700/70">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 rounded-full",
            live ? "animate-pulse-soft bg-jade-500" : "bg-miso-500",
          )}
        />
        {live ? label : `Polling every ${pollSeconds}s`}
      </p>
      <button
        type="button"
        onClick={refresh}
        aria-label="Refresh now"
        className="grid size-8 place-items-center rounded-lg border border-ink-900/12 text-ink-700 hover:bg-rice-100"
      >
        <RefreshCw
          className={cn("size-3.5", refreshing && "animate-spin")}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
