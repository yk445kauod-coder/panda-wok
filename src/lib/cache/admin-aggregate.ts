import "server-only";

import { unstable_cache } from "next/cache";

/**
 * `unstable_cache` for an admin aggregate read, with a direct-call fallback.
 *
 * The console's dashboards compute their figures in the Worker, not in the
 * database: `loadDashboardMetrics` pulls up to 2,000 orders and 5,000 order
 * items and folds them in JavaScript, which is where the Free plan's 10 ms CPU
 * cap (Error 1102) is spent. That work is identical for every viewer of the same
 * window and changes only when an order does, so a short shared cache removes it
 * from all but the first request in the window.
 *
 * This is the same mechanism as `cachedPublic`, kept separate because the TTL is
 * different in kind: public data is edited rarely and cached for minutes, while
 * these figures must stay close to live, so the window is measured in seconds.
 * The fallback is identical — outside a request (a build, a cron, a script)
 * `unstable_cache` has no store and would throw, so the function simply runs
 * uncached.
 */
export function cachedAdminAggregate<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: { revalidate: number; tags?: string[] },
): (...args: TArgs) => Promise<TResult> {
  const cached = unstable_cache(fn, keyParts, {
    revalidate: options.revalidate,
    tags: options.tags ?? [],
  });

  return async (...args: TArgs) => {
    try {
      return await cached(...args);
    } catch (error) {
      if (isMissingCacheStore(error)) return fn(...args);
      throw error;
    }
  };
}

/**
 * Matches only the framework's "no store" invariants. Kept narrow on purpose:
 * a broad check would swallow a real read failure and serve stale or empty data.
 */
function isMissingCacheStore(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("incrementalCache missing") ||
    message.includes("static generation store missing") ||
    message.includes("was called outside a request scope")
  );
}

/**
 * Cache window for the admin aggregates. Five seconds is short enough that a
 * fresh order shows up on the next glance and long enough that the burst of
 * re-renders a single click produces (the action's own revalidate, the poller's
 * next tick, a colleague opening the same tab) shares one computation instead of
 * repeating it. It is deliberately far shorter than the public layer's ten
 * minutes — these are operational figures, not catalogue copy.
 */
export const ADMIN_AGGREGATE_REVALIDATE = 5;
