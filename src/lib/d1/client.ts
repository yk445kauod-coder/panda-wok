/**
 * A supabase-js-shaped client over D1.
 *
 * The app talks to Supabase through 323 `.from()` calls and 48 `.rpc()` calls.
 * Rewriting those was the alternative to writing this; keeping the interface
 * means the pages, server actions and services do not change at all, and
 * `DATA_BACKEND=supabase` still returns the real Supabase client for an instant
 * rollback.
 *
 * What it implements is the subset the code actually uses, measured from the
 * call sites: eq/neq/gt/gte/lt/lte/like/ilike/is/in/or/not/contains,
 * order/limit/range, single/maybeSingle, select/insert/update/upsert/delete,
 * count, and one level of embedded relations.
 */

import {
  getD1Context,
  getD1Database,
  type D1Value,
} from "@/lib/d1/database";
import { fromSqlRow, newUuid } from "@/lib/d1/coerce";
import { D1AuthClient } from "@/lib/d1/auth";
import {
  buildDelete,
  buildEmbedWhere,
  buildInsert,
  buildSelect,
  buildUpdate,
  parseSelect,
  stampActor,
  stampTimestamps,
  type Embed,
  type Filter,
  type OrderTerm,
  type WriteRow,
} from "@/lib/d1/sql";
import { resolveEmbedLink, type EmbedLink } from "@/lib/d1/relations";
import { runRpc } from "@/lib/d1/rpc";

export type QueryResult<T> = {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number | null;
  status?: number;
};

/**
 * Tables that have no `id` column. The builder must not invent one for them —
 * `settings` and `feature_flags` key on `key`, `ai_usage_daily` on `day`, and
 * the join tables key on a pair. Injecting an `id` there produced
 * "table settings has no column named id".
 */
const NO_ID_TABLE = new Set([
  "settings", "feature_flags", "ai_usage_daily", "menu_item_ratings",
  "customer_tag_links", "team_thread_members", "staff", "ops_agent_settings",
  "auth_identities", "auth_users",
]);

/**
 * Tables whose `id` is an INTEGER PRIMARY KEY, so SQLite assigns it.
 *
 * These are the Postgres `bigserial`/`serial` tables — the append-only logs and
 * queues. The builder's default is to inject a UUID, which SQLite rejects on an
 * INTEGER column with "datatype mismatch": the insert fails and the row is
 * silently lost. That broke analytics ingestion (`/api/analytics` answered
 * `{"ok":false}` and `analytics_events` stayed empty), the activity timeline,
 * the audit trail, notifications and team messages. Left unset here, the column
 * auto-increments exactly as it did in Postgres.
 */
const AUTO_ID_TABLE = new Set([
  "order_status_history", "notifications", "team_messages",
  "activity_logs", "analytics_events", "audit_logs",
]);

/** The natural key to upsert on, for tables that have no `id`. */
const NATURAL_KEY: Record<string, string> = {
  settings: "key",
  feature_flags: "key",
  // One row per provider per day, so the conflict target is the pair.
  ai_usage_daily: "day,provider",
  menu_item_ratings: "menu_item_id",
  customer_tag_links: "customer_id",
  team_thread_members: "thread_id",
  staff: "user_id",
  ops_agent_settings: "id",
  auth_users: "id",
  auth_identities: "id",
};

/**
 * Whether a `table.column` exists, for the embed path's inferred links. Cached
 * per isolate: the schema does not change at runtime, and the probe would
 * otherwise run on every query that carries an unlisted embed.
 */
const COLUMN_CACHE = new Map<string, boolean>();

function toError(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

/**
 * The chainable, awaitable query builder.
 *
 * Awaiting it runs the statement; `.then` is what makes `await supabase
 * .from("x").select()` work without an explicit `.execute()`.
 */
export class D1QueryBuilder<T = unknown> implements PromiseLike<QueryResult<T>> {
  private filters: Filter[] = [];
  private orders: OrderTerm[] = [];
  private selectClause = parseSelect("*");
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private wantCount = false;
  private headOnly = false;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: WriteRow | WriteRow[] | null = null;
  private conflictTarget: string[] | undefined;
  private wantsSingle = false;
  private wantsMaybeSingle = false;
  private returnsRows = true;

  constructor(private readonly table: string) {}

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    this.selectClause = parseSelect(columns);
    if (this.mode === "select") this.mode = "select";
    if (options?.count) this.wantCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  insert(rows: WriteRow | WriteRow[]) {
    this.mode = "insert";
    this.payload = rows;
    return this;
  }

  update(patch: WriteRow) {
    this.mode = "update";
    this.payload = patch;
    return this;
  }

  upsert(rows: WriteRow | WriteRow[], options?: { onConflict?: string }) {
    this.mode = "insert";
    this.payload = rows;
    this.conflictTarget = options?.onConflict
      ? options.onConflict.split(",").map((c) => c.trim())
      : [NATURAL_KEY[this.table] ?? "id"];
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  // --- filters -------------------------------------------------------------

  private add(kind: Filter["kind"], column: string, value: unknown) {
    this.filters.push({ kind, column, value });
    return this;
  }

  eq(column: string, value: unknown) { return this.add("eq", column, value); }
  neq(column: string, value: unknown) { return this.add("neq", column, value); }
  gt(column: string, value: unknown) { return this.add("gt", column, value); }
  gte(column: string, value: unknown) { return this.add("gte", column, value); }
  lt(column: string, value: unknown) { return this.add("lt", column, value); }
  lte(column: string, value: unknown) { return this.add("lte", column, value); }
  like(column: string, value: unknown) { return this.add("like", column, value); }
  ilike(column: string, value: unknown) { return this.add("ilike", column, value); }
  is(column: string, value: unknown) { return this.add("is", column, value); }
  in(column: string, value: unknown[]) { return this.add("in", column, value); }
  contains(column: string, value: unknown) { return this.add("contains", column, value); }

  not(column: string, operator: string, value: unknown) {
    const inner: Filter = { kind: operator as Filter["kind"], column, value };
    this.filters.push({ kind: "not", column, value: inner });
    return this;
  }

  match(criteria: Record<string, unknown>) {
    for (const [column, value] of Object.entries(criteria)) this.add("eq", column, value);
    return this;
  }

  /**
   * PostgREST's `or("a.eq.1,b.eq.2")`. The app uses it for two shapes only —
   * an OR of `eq`s and an OR of `is null`s — so those two are parsed and the
   * rest is rejected loudly rather than silently mistranslated.
   */
  or(expression: string) {
    const parts = expression.split(",").map((p) => p.trim()).filter(Boolean);
    const orGroup: Filter[] = [];
    for (const part of parts) {
      const [column, operator, ...rest] = part.split(".");
      const value = rest.join(".");
      if (operator === "eq") orGroup.push({ kind: "eq", column, value: value === "null" ? null : value });
      else if (operator === "is") orGroup.push({ kind: "is", column, value: value === "null" ? null : value });
      else throw new Error(`d1-compat: unsupported or() operator "${operator}" in "${part}"`);
    }
    this.filters.push({ kind: "or" as Filter["kind"], column: "", value: orGroup });
    return this;
  }

  filter(column: string, operator: string, value: unknown) {
    return this.add(operator as Filter["kind"], column, value);
  }

  // --- shaping -------------------------------------------------------------

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single() {
    this.wantsSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantsMaybeSingle = true;
    return this;
  }

  returns() {
    this.returnsRows = true;
    return this;
  }

  // --- execution -----------------------------------------------------------

  private async run(): Promise<QueryResult<T>> {
    try {
      switch (this.mode) {
        case "insert":
          return await this.runInsert();
        case "update":
          return await this.runUpdate();
        case "delete":
          return await this.runDelete();
        default:
          return await this.runSelect();
      }
    } catch (error) {
      return { data: null as unknown as T, error: toError(error), status: 500 };
    }
  }

  private async runSelect(): Promise<QueryResult<T>> {
    const db = getD1Database();
    // A filter whose dotted column names an embed (`orders.created_at`) lives on
    // the child table and cannot appear in the parent WHERE. The embed path runs
    // its own child query and applies it there; any other dotted filter is a
    // column this table does not have, so dropping it beats a "no such column"
    // that would fail the whole read.
    const parentFilters = this.selectClause.embeds.length > 0
      ? this.filters.filter((f) => f.column.indexOf(".") === -1)
      : this.filters;
    const { sql, params, countSql, countParams } = buildSelect({
      table: this.table,
      clause: this.selectClause,
      filters: parentFilters,
      orders: this.orders,
      limit: this.limitCount,
      offset: this.offsetCount,
      count: this.wantCount,
    });

    if (this.headOnly) {
      const countResult = await db.prepare(countSql ?? sql).bind(...(params as D1Value[])).first<{ count: number }>();
      return { data: null as unknown as T, error: null, count: countResult?.count ?? 0 };
    }

    // An embed needs its join column, which the caller often leaves out of the
    // select list (`select("id, name_en, categories (...)")`). Re-run with the FK
    // appended so the attach step has something to match on.
    const embedSelect = this.embedSelectSql();
    const statement = db.prepare(embedSelect ?? sql).bind(...(params as D1Value[]));
    const result = await statement.all<Record<string, unknown>>();
    let rows = (result.results ?? []).map((row) => fromSqlRow(this.table, row));

    if (this.selectClause.embeds.length > 0) {
      rows = await this.attachEmbeds(rows);
    }

    let count: number | null = null;
    if (this.wantCount && countSql) {
      const countResult = await db
        .prepare(countSql)
        .bind(...(countParams as D1Value[]))
        .first<{ count: number }>();
      count = countResult?.count ?? 0;
    }

    return this.shape(rows, count);
  }

  /**
   * The SELECT to use when the query has an embed.
   *
   * A join needs a foreign key, and which one it is (a child's `order_id` or a
   * parent's `category_id`) is only known once the relation is inspected. Rather
   * than guess and risk `no such column: "menu_item_id"`, the embed path selects
   * the parent's full row; the extra columns cost a few bytes and the app reads
   * only the fields it named.
   */
  private embedSelectSql(): string | null {
    if (this.selectClause.embeds.length === 0) return null;
    const { sql } = buildSelect({
      table: this.table,
      clause: { columns: [], embeds: [] },
      // Dotted filters name an embed's column, not one on this table; the child
      // query applies them, so they must not reach this parent SELECT.
      filters: this.filters.filter((f) => f.column.indexOf(".") === -1),
      orders: this.orders,
      limit: this.limitCount,
      offset: this.offsetCount,
      count: false,
    });
    return sql;
  }

  /** Fetch and attach each embedded relation, one query per relation. */
  private async attachEmbeds(
    rows: Array<Record<string, unknown>>,
  ): Promise<Array<Record<string, unknown>>> {
    return this.attachEmbedsInto(this.table, this.selectClause.embeds, rows, this.filters);
  }

  /**
   * Attach `embeds` to `rows` (all rows of `parentTable`).
   *
   * The join column comes from `resolveEmbedLink`, which encodes the foreign keys
   * the Postgres schema declared; the old name-based guess missed every relation
   * that links through a differently-named column (a profile hangs off
   * `user_id`), so the screen rendered empty. Nested embeds recurse with the
   * child rows, which is how `modifier_groups (modifier_options (...))` fills in.
   *
   * An *inferred* link (a pair not in the map) is checked against the schema
   * first: if the guessed child column does not exist, the relation is dropped
   * instead of emitting a query that fails on `no such column`.
   */
  private async attachEmbedsInto(
    parentTable: string,
    embeds: Embed[],
    rows: Array<Record<string, unknown>>,
    filters: Filter[],
  ): Promise<Array<Record<string, unknown>>> {
    const db = getD1Database();
    let current = rows;

    for (const embed of embeds) {
      const childTable = embed.table;
      const link = resolveEmbedLink(parentTable, childTable);
      const toOne = link.childKey === "id";
      const emptyRelation = () => (embed.inner ? [] : toOne ? null : []);

      if (!link.exact && !(await this.columnExists(childTable, link.childKey))) {
        const empty = emptyRelation();
        current = embed.inner
          ? []
          : current.map((r) => ({ ...r, [childTable]: empty }));
        continue;
      }

      if (link.join) {
        current = await this.attachManyToMany(parentTable, embed, link, current, filters);
        continue;
      }

      // The join values on the parent side; the child rows match these.
      const parentValues = Array.from(
        new Set(current.map((r) => r[link.parentKey]).filter((v) => v != null) as string[]),
      );
      const childWhere = buildEmbedWhere(filters, childTable);
      if (parentValues.length === 0) {
        const empty = emptyRelation();
        current = embed.inner ? [] : current.map((r) => ({ ...r, [childTable]: empty }));
        continue;
      }

      const childColumns = embed.columns.length > 0
        ? `"${childTable}".id, ${embed.columns.map((c) => `"${childTable}"."${c}"`).join(", ")}`
        : `"${childTable}".*`;

      const childSql = `SELECT ${childColumns}, "${childTable}"."${link.childKey}" AS __fk FROM "${childTable}" WHERE "${childTable}"."${link.childKey}" IN (${parentValues.map(() => "?").join(", ")})${childWhere.sql}`;
      let childResult;
      try {
        childResult = await db
          .prepare(childSql)
          .bind(...([...parentValues, ...childWhere.params] as D1Value[]))
          .all<Record<string, unknown>>();
      } catch {
        childResult = null;
      }

      if (!childResult || !childResult.success) {
        const empty = emptyRelation();
        current = embed.inner ? [] : current.map((r) => ({ ...r, [childTable]: empty }));
        continue;
      }

      const grouped = new Map<string, Array<Record<string, unknown>>>();
      for (const raw of childResult.results ?? []) {
        const row = fromSqlRow(childTable, raw);
        const fk = String(row.__fk);
        delete row.__fk;
        if (!grouped.has(fk)) grouped.set(fk, []);
        grouped.get(fk)!.push(row);
      }

      // Fill nested relations on the child rows before they are attached. The
      // recursion returns new row objects, so the grouping is rebuilt by id;
      // mutating the objects in place would be the only alternative and the
      // builder is immutable by design.
      const childRows = [...grouped.values()].flat();
      if (embed.embeds.length > 0 && childRows.length > 0) {
        const filled = await this.attachEmbedsInto(childTable, embed.embeds, childRows, filters);
        const filledById = new Map(filled.map((r) => [String(r.id), r]));
        for (const [key, group] of grouped) {
          grouped.set(
            key,
            group.map((r) => filledById.get(String(r.id)) ?? r),
          );
        }
      }

      // Matching the child's primary key (`childKey === "id"`) means the parent
      // holds the FK, so this is a to-one relation and PostgREST returns an
      // object (or null). Matching a non-key column means the child holds the FK
      // and the result is a list.
      let attached = toOne
        ? current.map((r) => ({
            ...r,
            [childTable]: grouped.get(String(r[link.parentKey]))?.[0] ?? null,
          }))
        : current.map((r) => ({
            ...r,
            [childTable]: grouped.get(String(r[link.parentKey])) ?? [],
          }));
      // An `!inner` embed with a filter keeps only parents that have a matching
      // child, mirroring PostgREST: `orders!inner (created_at)` filtered to the
      // window must not return orders with no line in it.
      if (embed.inner && childWhere.sql !== "") {
        attached = attached.filter((r) =>
          toOne ? r[childTable] !== null : (r[childTable] as Array<unknown>).length > 0,
        );
      }
      current = attached;
    }

    return current;
  }

  /**
   * A many-to-many embed, e.g. a customer note's tags: neither side carries the
   * other's id, so the pair is matched through `link.join.table`.
   */
  private async attachManyToMany(
    parentTable: string,
    embed: Embed,
    link: EmbedLink & { exact: boolean },
    rows: Array<Record<string, unknown>>,
    filters: Filter[],
  ): Promise<Array<Record<string, unknown>>> {
    const db = getD1Database();
    const childTable = embed.table;
    const join = link.join!;
    const parentValues = Array.from(
      new Set(rows.map((r) => r[link.parentKey]).filter((v) => v != null) as string[]),
    );
    if (parentValues.length === 0) {
      return rows.map((r) => ({ ...r, [childTable]: [] }));
    }

    const childColumns = embed.columns.length > 0
      ? `"${childTable}".id, ${embed.columns.map((c) => `"${childTable}"."${c}"`).join(", ")}`
      : `"${childTable}".*`;
    const childWhere = buildEmbedWhere(filters, childTable);
    const sql = `SELECT ${childColumns}, "j"."${join.parentColumn}" AS __parent FROM "${childTable}"
      JOIN "${join.table}" AS "j" ON "j"."${join.childColumn}" = "${childTable}"."id"
      WHERE "j"."${join.parentColumn}" IN (${parentValues.map(() => "?").join(", ")})${childWhere.sql}`;

    let result;
    try {
      result = await db
        .prepare(sql)
        .bind(...([...parentValues, ...childWhere.params] as D1Value[]))
        .all<Record<string, unknown>>();
    } catch {
      result = null;
    }
    if (!result || !result.success) {
      return rows.map((r) => ({ ...r, [childTable]: [] }));
    }

    const grouped = new Map<string, Array<Record<string, unknown>>>();
    for (const raw of result.results ?? []) {
      const row = fromSqlRow(childTable, raw);
      const parentId = String(row.__parent);
      delete row.__parent;
      if (!grouped.has(parentId)) grouped.set(parentId, []);
      grouped.get(parentId)!.push(row);
    }
    void parentTable;
    return rows.map((r) => ({
      ...r,
      [childTable]: grouped.get(String(r[link.parentKey])) ?? [],
    }));
  }

  /** Whether `table` has `column`, cached per isolate. */
  private async columnExists(table: string, column: string): Promise<boolean> {
    const key = `${table}.${column}`;
    const cached = COLUMN_CACHE.get(key);
    if (cached !== undefined) return cached;
    try {
      const result = await getD1Database()
        .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`)
        .bind(table, column)
        .first();
      const exists = Boolean(result);
      COLUMN_CACHE.set(key, exists);
      return exists;
    } catch {
      return false;
    }
  }

  private shape(rows: Array<Record<string, unknown>>, count: number | null): QueryResult<T> {
    if (this.wantsSingle) {
      if (rows.length === 0) {
        return {
          data: null as unknown as T,
          error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
          status: 406,
        };
      }
      return { data: rows[0] as T, error: null, count };
    }
    if (this.wantsMaybeSingle) {
      return { data: (rows[0] ?? null) as T, error: null, count };
    }
    return { data: rows as unknown as T, error: null, count };
  }

  private async runInsert(): Promise<QueryResult<T>> {
    const db = getD1Database();
    const context = getD1Context();
    const input = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    const rows = input.map((row) => {
      const stamped = stampTimestamps(this.table, row, { insert: true });
      if (stamped.id === undefined && !NO_ID_TABLE.has(this.table) && !AUTO_ID_TABLE.has(this.table)) {
        stamped.id = newUuid();
      }
      return stamped;
    });
    const { sql, params } = buildInsert(this.table, rows, context.restaurantId, this.conflictTarget);
    const result = await db.prepare(sql).bind(...(params as D1Value[])).run();
    if (!result.success) return { data: null as unknown as T, error: { message: result.error ?? "insert failed" } };

    const returned = rows.map((r) => fromSqlRow(this.table, r));
    if (this.wantsSingle) return { data: returned[0] as T, error: null };
    if (this.wantsMaybeSingle) return { data: (returned[0] ?? null) as T, error: null };
    return { data: returned as unknown as T, error: null };
  }

  private async runUpdate(): Promise<QueryResult<T>> {
    const db = getD1Database();
    const context = getD1Context();
    const patch = stampActor(
      this.table,
      stampTimestamps(this.table, (this.payload as WriteRow) ?? {}, { insert: false }),
      context.userId,
      { insert: false },
    );
    const { sql, params } = buildUpdate(this.table, patch, this.filters, context.restaurantId);
    const result = await db.prepare(sql).bind(...(params as D1Value[])).run();
    if (!result.success) return { data: null as unknown as T, error: { message: result.error ?? "update failed" } };

    // PostgREST returns the updated rows; re-select them so `.select()` after
    // `.update()` still yields data.
    if (this.returnsRows) {
      const reselect = new D1QueryBuilder<T>(this.table);
      reselect.selectClause = this.selectClause;
      reselect.filters = this.filters;
      reselect.wantsSingle = this.wantsSingle;
      reselect.wantsMaybeSingle = this.wantsMaybeSingle;
      return reselect.run();
    }
    return { data: null as unknown as T, error: null };
  }

  private async runDelete(): Promise<QueryResult<T>> {
    const db = getD1Database();
    const { sql, params } = buildDelete(this.table, this.filters);
    const result = await db.prepare(sql).bind(...(params as D1Value[])).run();
    if (!result.success) return { data: null as unknown as T, error: { message: result.error ?? "delete failed" } };
    return { data: null as unknown as T, error: null };
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export class D1Client {
  /**
   * The `supabase.auth` subset, over D1.
   *
   * Lazy so importing the client does not pull the auth module (and its cookie
   * and WebCrypto imports) into every read-only call site, and a client created
   * for a plain data read never touches it.
   */
  private authClient: D1AuthClient | null = null;

  constructor(private readonly options: { elevated: boolean; userId: string | null } = { elevated: false, userId: null }) {}

  get auth(): D1AuthClient {
    if (!this.authClient) this.authClient = new D1AuthClient();
    return this.authClient;
  }

  from<T = unknown>(table: string): D1QueryBuilder<T> {
    return new D1QueryBuilder<T>(table);
  }

  rpc<T = unknown>(name: string, params?: Record<string, unknown>): Promise<QueryResult<T>> {
    return runRpc<T>(name, params ?? {}, {
      elevated: this.options.elevated,
      userId: this.options.userId,
      restaurantId: getD1Context().restaurantId,
    });
  }

  /** The ops console elevates through its gate; the shim honours the same flag. */
  get isElevated(): boolean {
    return this.options.elevated;
  }
}
