import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvNextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";
import resilientIncrementalCache from "./src/lib/cache/incremental-cache";

/**
 * Cloudflare Workers/Pages configuration for the OpenNext adapter.
 *
 * The adapter compiles the Next.js server build into a single Worker running
 * on the nodejs_compat layer — the supported path for App Router on Cloudflare
 * (next-on-pages is Edge-only and breaks on Next 16).
 *
 * Caching: the public data layer wraps its reads in `unstable_cache`, so Next
 * needs a real incremental cache to store those entries across requests — the
 * default "dummy" stores nothing, so every render would re-query Supabase. Both
 * KV overrides are enabled, and both degrade safely when the namespace is not
 * bound (the tag cache returns early; the incremental cache is wrapped in
 * `src/lib/cache/incremental-cache.ts` so a missing binding is a cache miss, not
 * a thrown render). Bind the two namespaces in `wrangler.jsonc` / `wrangler.toml`
 * to turn the caching on; leave them unbound and the site renders uncached.
 */
export default defineCloudflareConfig({
  incrementalCache: resilientIncrementalCache,
  tagCache: kvNextTagCache,
});
