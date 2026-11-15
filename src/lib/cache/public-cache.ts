import { unstable_cache } from "next/cache";
import { readBackup, saveBackup } from "@/lib/cache/catalog-backup";

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
  const backupName = keyParts.join(":");

  /**
   * The reader with its safety net attached, and the function handed to
   * `unstable_cache` — deliberately not the raw `fn`.
   *
   * Next calls this function again whenever it revalidates the entry, and that
   * path does not run through the wrapper below; it was the one that failed the
   * build, because a revalidation against a restricted Supabase threw and took
   * the whole render with it. With the net inside, every caller — first read,
   * revalidation, a script with no request store — resolves from the last
   * known-good copy instead of throwing.
   */
  const withBackup = async (...args: TArgs): Promise<TResult> => {
    try {
      const value = await fn(...args);
      // Fire-and-forget: the caller is already waiting on the read, and a slow
      // or failed backup write must not delay it.
      void saveBackup(backupName, value, args);
      return value;
    } catch (error) {
      // The read genuinely failed — Supabase is unreachable, restricted, or
      // returned an error. Serve the last known-good copy so the storefront
      // stays up instead of turning a data outage into a 500, and so a build
      // against a restricted project still prerenders the pages.
      const backup = await readBackup<TResult>(backupName, args);
      if (backup !== undefined) return backup;
      throw error;
    }
  };

  const cached = unstable_cache(withBackup, keyParts, options);

  return async (...args: TArgs) => {
    try {
      return await cached(...args);
    } catch (error) {
      // No request-scoped store (a build, the dev server, a cron handler):
      // `unstable_cache` throws before ever reaching the reader, so call it
      // directly. A genuine failure still resolves from the backup.
      if (isMissingCacheStore(error)) return withBackup(...args);
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
