"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useOpsOrderSignal } from "@/lib/live/use-ops-signal";
import { cn } from "@/lib/utils/format";
import { useT } from "@/components/i18n-provider";
import { refreshAdminData } from "@/lib/admin/client";

/**
 * The orders board's live indicator and manual refresh.
 *
 * Liveness comes from the public `ops-orders` signal (see `useOpsOrderSignal`):
 * a ping re-reads the page through `refreshAdminData`. The page itself owns the
 * fallback poll, so this component never polls — the two together used to fire
 * two requests per interval on the same endpoint.
 */
export function LiveOrdersFeed({ label = "Live" }: { label?: string }) {
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshNow = useCallback(() => {
    setRefreshing(true);
    refreshAdminData();
    // The server component streams in; clear the spinner once the frame settles.
    window.setTimeout(() => setRefreshing(false), 600);
  }, []);

  // One order action produces a status change *and* a new history row, and the
  // acting client also refreshes — so a burst of pings lands within a few
  // milliseconds. Coalescing them into one render keeps the board from
  // re-running its server component several times for one tap.
  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refreshNow, 250);
  }, [refreshNow]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const live = useOpsOrderSignal(refresh);

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
        {live ? label : t("admin.pages.orders.polling")}
      </p>
      <button
        type="button"
        onClick={refresh}
        aria-label={t("admin.pages.orders.refresh")}
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
