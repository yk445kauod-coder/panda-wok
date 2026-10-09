/**
 * A KV-backed incremental cache that degrades to a cache miss when the KV
 * binding is absent.
 *
 * Why this wrapper exists: the public data layer wraps its reads in
 * `unstable_cache`. Next calls the configured incremental cache for every one of
 * those reads, and if that call *throws*, the render fails — `unstable_cache`
 * does not catch it. The stock `@opennextjs/cloudflare` KV cache throws
 * `IgnorableError("No KV Namespace")` when `NEXT_INC_CACHE_KV` is not bound, and
 * the fallback "dummy" cache throws on every method. Either one would turn a
 * missing binding into a 500 on the menu, home page and every other cached read.
 *
 * So the binding is treated as optional at *request* time: with a KV namespace
 * bound the reads are cached across isolates; without one they simply recompute
 * (the behaviour before this layer existed). That makes the KV namespace a pure
 * speed/egress optimisation — the owner can add it, or not, and the site renders
 * either way.
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
} from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

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
  name: "panda-wok-resilient-kv",

  async get<CacheType extends CacheEntryType = "cache">(
    key: string,
    cacheType?: CacheType,
  ): Promise<WithLastModified<CacheValue<CacheType>> | null> {
    if (!kvBound()) return null;
    return kvIncrementalCache.get(key, cacheType);
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
