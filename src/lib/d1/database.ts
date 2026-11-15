/**
 * The D1 database handle the shim talks to.
 *
 * Deliberately structural: the shim never imports `@cloudflare/workers-types`
 * or `next/headers`, so the query builder stays testable under plain Node with
 * a fake handle, and the same code runs in a Worker, in a test, and under
 * `node:sqlite` in a script.
 */
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
 * Bind the D1 database. The Worker calls this once per request from
 * `getCloudflareContext()`; a test or script calls it with `node:sqlite`.
 */
export function setD1Database(database: D1Database | null): void {
  handle = database;
}

export function getD1Database(): D1Database {
  if (!handle) {
    throw new Error(
      "D1 is not bound. Call setD1Database() with the request's D1 binding " +
        "(or a node:sqlite adapter in a script) before using the d1 client.",
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
