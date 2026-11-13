/**
 * The incremental cache the Worker runs on.
 *
 * Two stores, read in this order:
 *
 *  1. KV (`NEXT_INC_CACHE_KV`) — the cross-request store. It is where Next
 *     writes a re-render, so reading it first is what makes an admin edit
 *     visible: a revalidated entry lands here with a fresh `lastModified`, and
 *     Next serves it instead of the stale copy.
 *  2. The bundled static-assets cache — the pages this build prerendered, shipped
 *     inside the deployment under `cdn-cgi/_next_cache/`. They are read straight
 *     from the `ASSETS` binding, so a cold KV (a fresh deploy, before
 *     `populateCache` has run, or a day the KV write quota is spent) still serves
 *     the prerendered HTML instead of re-rendering every page and tripping the
 *     CPU limit.
 *
 * Why the wrapper exists at all: the public data layer wraps its reads in
 * `unstable_cache`, and Next calls the configured incremental cache for every
 * one of them. If that call *throws*, the render fails — `unstable_cache` does
 * not catch it. The stock KV cache throws `IgnorableError("No KV Namespace")`
 * when the binding is absent, and the "dummy" fallback throws on every method,
 * so either would turn a missing binding into a 500 on the menu and home page.
 * Both stores here degrade to a miss instead.
 *
 * The context is read lazily inside each method rather than at module load,
 * because OpenNext instantiates the cache *outside* the request context, where
 * `getCloudflareContext()` is not yet available.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type {
  CacheEntryType,
  CacheValue,
  IncrementalCache,
  WithLastModified,
} from "@opennextjs/aws/types/overrides";
import kvIncrementalCache, {
  BINDING_NAME,
  NAME as KV_CACHE_NAME,
} from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/** True when the KV namespace is bound for this request. Never throws. */
function kvBound(): boolean {
  try {
    return Boolean(getCloudflareContext().env?.[BINDING_NAME]);
  } catch {
    // No request context (build, `next dev` without the adapter, SSG worker):
    // there is no cache to use, and that is not an error.
    return false;
  }
}

const resilientIncrementalCache: IncrementalCache = {
  // Must stay the stock KV cache name. `opennextjs-cloudflare populateCache`
  // switches on `incrementalCache.name` to decide whether to upload the build's
  // prerendered pages; an unrecognised name is skipped, leaving the cache cold
  // so production re-renders every page and trips the CPU limit.
  name: KV_CACHE_NAME,

  async get<CacheType extends CacheEntryType = "cache">(
    key: string,
    cacheType?: CacheType,
  ): Promise<WithLastModified<CacheValue<CacheType>> | null> {
    if (kvBound()) {
      const fromKv = await kvIncrementalCache
        .get(key, cacheType)
        .catch(() => null);
      if (fromKv) return fromKv;
    }
    // KV has no entry yet (fresh deploy, or a revalidation that has not run).
    // Fall back to the copy baked into the deployment so the page is still
    // served statically rather than re-rendered.
    return staticAssetsIncrementalCache.get(key, cacheType).catch(() => null);
  },

  async set<CacheType extends CacheEntryType = "cache">(
    key: string,
    value: CacheValue<CacheType>,
    cacheType?: CacheType,
  ): Promise<void> {
    if (!kvBound()) return;
    await kvIncrementalCache.set(key, value, cacheType);
  },

  async delete(key: string): Promise<void> {
    if (!kvBound()) return;
    await kvIncrementalCache.delete(key);
  },
};

export default resilientIncrementalCache;
