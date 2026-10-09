import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A per-request memo, for work that is expensive and safe to share.
 *
 * Why this exists: the console runs on a Cloudflare Worker, which caps
 * subrequests per invocation (50 on the free plan). One document-creating agent
 * turn was measured at **78** — the model loop calls several tools, and each
 * `create_document` re-queried the whole dashboard (18-23 Supabase round trips).
 * Past the cap the runtime kills the invocation mid-flight: the artifact row is
 * left in `building` forever and the UI can only say "something went wrong".
 *
 * The fix is to let one turn reuse the queries it already paid for. The store is
 * keyed by a caller-supplied string (the document kind, the days window), so a
 * second document in the same turn reuses the first one's rows instead of
 * re-fetching them. Nothing is cached across requests — a new request gets a new
 * store — so this can never serve stale data to a later turn.
 *
 * `AsyncLocalStorage` keeps the scope tied to the async call tree rather than a
 * module global, so two concurrent turns (the console and the cron report)
 * cannot see each other's entries. `nodejs_compat` provides it on the Worker.
 *
 * Rejections are deliberately *not* memoised: a transient failure should be
 * retried by the next caller, not turned into a permanent error for the turn.
 */

const store = new AsyncLocalStorage<Map<string, Promise<unknown>>>();
const counters = new AsyncLocalStorage<Map<string, number>>();

/**
 * Runs `fn` inside a fresh memo scope. Everything `memo()` is called with inside
 * shares one map, which is discarded when `fn` settles.
 */
export function withRequestScope<T>(fn: () => T): T {
  return store.run(new Map(), () => counters.run(new Map(), fn));
}

/** True when the caller is inside a `withRequestScope` block. */
export function inRequestScope(): boolean {
  return store.getStore() !== undefined;
}

/**
 * Returns the memoised result of `load` for `key`, running it at most once per
 * scope. Outside a scope it just calls `load`, so a plain script or test keeps
 * its current behaviour.
 */
export function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const map = store.getStore();
  if (!map) return load();

  const existing = map.get(key);
  if (existing) return existing as Promise<T>;

  const pending = load().catch((error) => {
    // Do not remember a failure — the next caller should try again.
    map.delete(key);
    throw error;
  });
  map.set(key, pending);
  return pending;
}

/**
 * A named counter for the current scope, for budgeting expensive work per turn.
 * Outside a scope the limit is ignored, so a script or test is never throttled.
 */
export function takeToken(name: string, limit: number): boolean {
  const map = counters.getStore();
  if (!map) return true;
  const used = map.get(name) ?? 0;
  if (used >= limit) return false;
  map.set(name, used + 1);
  return true;
}
