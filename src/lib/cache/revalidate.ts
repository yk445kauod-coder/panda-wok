import "server-only";

import { revalidateTag } from "next/cache";
import { ALL_PUBLIC_TAGS, type PublicCacheTag } from "@/lib/cache/tags";

/**
 * Invalidates one slice of the cached public data layer.
 *
 * `revalidateTag` needs a request scope (it writes onto the static-generation
 * store). It is called from server actions, which always have one, but a stray
 * call from a script or a cron route would otherwise throw and abort the caller.
 * Swallowing that is deliberate: failing to invalidate a cache must never fail
 * the mutation that triggered it — the entry then simply expires at its TTL.
 *
 * The `{ expire: 0 }` profile expires the entry immediately rather than
 * deferring to the background, so an admin save is visible on the very next
 * request instead of after a stale-while-revalidate window.
 */
export function revalidatePublicData(tags: PublicCacheTag | PublicCacheTag[]): void {
  const list = Array.isArray(tags) ? tags : [tags];
  try {
    for (const tag of list) revalidateTag(tag, { expire: 0 });
  } catch (error) {
    console.warn(
      `[cache] could not revalidate ${list.join(", ")}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** Invalidates every public cache tag — for changes with broad or unclear reach. */
export function revalidateAllPublicData(): void {
  revalidatePublicData(ALL_PUBLIC_TAGS);
}
