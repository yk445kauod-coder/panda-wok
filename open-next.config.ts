import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Cloudflare Workers/Pages configuration for the OpenNext adapter.
 *
 * The adapter compiles the Next.js server build into a single Worker running
 * on the nodejs_compat layer — the supported path for App Router on Cloudflare
 * (next-on-pages is Edge-only and breaks on Next 16).
 */
export default defineCloudflareConfig({
  // Incremental cache is backed by Workers KV in production; local builds fall
  // back to the in-memory cache so `next build` still works without bindings.
  incrementalCache: undefined,
});
