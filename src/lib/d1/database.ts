/**
 * The D1 database handle the shim talks to.
 *
 * Deliberately structural: the shim never imports `@cloudflare/workers-types`
 * or `next/headers`, so the query builder stays testable under plain Node with
 * a fake handle, and the same code runs in a Worker, in a test, and under
 * `node:sqlite` in a script.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type D1Value = string | number | null;

export type D1Result<T = Record<string, unknown>> = {
  results?: T[];
  success: boolean;
  meta?: {
    changes?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
    duration?: number;
  };
  error?: string;
};

/**
 * The subset of the D1 prepared-statement API the shim uses.
 *
 * `bind` returns the statement (D1 chains), and a statement is awaited directly
 * for a write and `.all()`/`.first()` for a read, exactly as D1 defines it.
 */
export interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

/** Where the shim reads the current user and restaurant from. */
export type D1Context = {
  userId: string | null;
  restaurantId: string;
  /** True for the service-role client: it skips the policy layer. */
  elevated: boolean;
};

let handle: D1Database | null = null;
let context: D1Context = {
  userId: null,
  restaurantId: "b54b2620-90c5-4295-b617-bc1389db3ee9",
  elevated: false,
};

/**
 * Bind the D1 database. A test or script calls this with `node:sqlite`.
 */
export function setD1Database(database: D1Database | null): void {
  handle = database;
}

/** The bindings this app reads off the Cloudflare context. */
export type CloudflareBindings = {
  D1_DB?: D1Database;
  /**
   * R2 bucket for uploaded dish photography (`panda-wok-media` in
   * `wrangler.jsonc`). Present only once R2 is enabled and the binding is
   * attached to the deployment; absent, uploads fall back to Supabase Storage.
   */
  MEDIA_BUCKET?: R2BucketLike;
  /** Present only in a Worker-hosted deploy; the Pages build reaches the hub by URL. */
  OPS_HUB?: unknown;
  OPS_HUB_URL?: string;
  OPS_TOKEN?: string;
};

/**
 * The slice of the R2 API the app uses, declared structurally so this module
 * keeps no dependency on `@cloudflare/workers-types` (mirrors `D1Database`).
 */
export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream | null;
    httpMetadata?: { contentType?: string; cacheControl?: string };
  } | null>;
}

let cachedBindings: CloudflareBindings | null = null;

/**
 * The Worker bindings, resolved lazily.
 *
 * The app is a single Worker, so the bindings are the same for every request in
 * an isolate; reading them once and caching is safe and avoids a
 * `getCloudflareContext()` call on every query. Outside Cloudflare (a unit test,
 * a plain `next dev`) there is no context to read and this returns `{}`, which
 * every caller treats as "binding absent".
 */
export function getCloudflareBindings(): CloudflareBindings {
  if (cachedBindings) return cachedBindings;
  let resolved: CloudflareBindings = {};
  try {
    // The package types `env` as its own `CloudflareEnv`; the shape we care about
    // is a subset, so narrow through `unknown` rather than widen their type.
    resolved = (getCloudflareContext().env ?? {}) as unknown as CloudflareBindings;
  } catch {
    resolved = {};
  }
  cachedBindings = resolved;
  return resolved;
}

/** Bind the D1 handle from the Cloudflare context, once per isolate. */
export function bindD1FromCloudflare(): boolean {
  if (handle) return true;
  const binding = getCloudflareBindings().D1_DB;
  if (!binding) return false;
  handle = binding;
  return true;
}

export function getD1Database(): D1Database {
  if (!handle) bindD1FromCloudflare();
  if (!handle) {
    throw new Error(
      "D1 is not bound. The Worker must expose a D1_DB binding, or a test must " +
        "call setD1Database() with a node:sqlite adapter.",
    );
  }
  return handle;
}

export function setD1Context(next: Partial<D1Context>): void {
  context = { ...context, ...next };
}

export function getD1Context(): D1Context {
  return context;
}
