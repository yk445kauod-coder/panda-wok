"use client";

import { useCallback, useState } from "react";
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

  const refresh = useCallback(() => {
    setRefreshing(true);
    refreshAdminData();
    // The server component streams in; clear the spinner once the frame settles.
    window.setTimeout(() => setRefreshing(false), 600);
  }, []);

  // The shared ops store already re-reads on every realtime ping (it owns the
  // tab's one poll and dispatches `panda-wok:live`), so this indicator takes the
  // live flag only — a callback here would fire a second fetch per event.
  const live = useOpsOrderSignal();

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
