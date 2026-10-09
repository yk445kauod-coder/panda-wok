import { unstable_cache } from "next/cache";

/**
 * `unstable_cache` for a public read, with a direct-call fallback.
 *
 * Next's `unstable_cache` needs the request-scoped incremental cache. Outside a
 * request — the scheduled ops agent, a cron handler, a script, `next build`
 * collecting config — there is no store and the wrapped function throws
 * `Invariant: incrementalCache missing`. That is a real failure mode here: the
 * ops agent calls the same catalogue/settings readers the pages do, and it must
 * keep working without a request.
 *
 * So a missing store is treated as "caching unavailable for this call": the
 * function runs uncached and the caller is none the wiser. A genuine error from
 * inside the function still propagates, so this can never mask a data bug.
 */
export function cachedPublic<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: { revalidate: number; tags: string[] },
): (...args: TArgs) => Promise<TResult> {
  const cached = unstable_cache(fn, keyParts, options);

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
 * a broad `instanceof Error` check would swallow a real read failure and serve
 * stale or empty data.
 */
function isMissingCacheStore(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("incrementalCache missing") ||
    message.includes("static generation store missing") ||
    message.includes("was called outside a request scope")
  );
}
