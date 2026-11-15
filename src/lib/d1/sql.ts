/**
 * SQL compilation for the supabase-js-shaped query builder.
 *
 * Kept apart from the builder so the SQL is unit-testable without a database:
 * `buildSelect`, `buildInsert`, `buildUpdate` and `buildDelete` return the SQL
 * plus its bound parameters, and the builder only has to run them.
 */

import { newUuid, nowIso, toSqlValue } from "@/lib/d1/coerce";

export type Filter = {
  kind:
    | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
    | "like" | "ilike" | "is" | "in" | "not" | "contains" | "or";
  column: string;
  value: unknown;
};

export type OrderTerm = { column: string; ascending: boolean };

/**
 * One embedded relation in a select, e.g. `order_items (quantity)`.
 *
 * `embeds` holds the relations nested *inside* this one, so
 * `menu_items (modifier_groups (modifier_options (id)))` keeps its full tree
 * rather than collapsing the inner relation into a bogus column name.
 */
export type Embed = {
  table: string;
  /** Scalar columns of the embedded table; `*`/empty means all. */
  columns: string[];
  inner: boolean;
  embeds: Embed[];
};

/** A parsed `select("a, b, child (x, y)")` clause. */
export type SelectClause = {
  /** Columns requested at this level; `*` or empty means all. */
  columns: string[];
  /** Embedded relations, e.g. `order_items (quantity)`. */
  embeds: Embed[];
};

const COLUMN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quote(identifier: string): string {
  if (!COLUMN.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

/**
 * Parse a PostgREST select string.
 *
 * Handles `*`, a comma-separated column list, and one level of embedded
 * relations — `order_items (quantity)`, `categories (id, name_en, slug)` and
 * `orders!inner (created_at)` — which is all the app uses (19 sites).
 */
export function parseSelect(input: string | undefined): SelectClause {
  const source = (input ?? "*").trim();
  if (source === "" || source === "*") return { columns: [], embeds: [] };
  return parseClause(source);
}

/**
 * Split one level of a select body into columns and embeds.
 *
 * A `(` opens an embed whose body is parsed by this same function, so nesting is
 * preserved (`menu_items (modifier_groups (modifier_options (id)))`). Top-level
 * commas separate tokens; a comma inside parentheses belongs to the embed.
 */
function parseClause(source: string): SelectClause {
  const columns: string[] = [];
  const embeds: Embed[] = [];
  let depth = 0;
  let buffer = "";

  const flush = (token: string) => {
    const text = token.trim();
    if (!text || text === "*") return;
    const open = text.indexOf("(");
    if (open === -1) {
      // `alias:column` is a rename; the app does not use one, but keep the column.
      columns.push(text.includes(":") ? text.split(":")[1].trim() : text);
      return;
    }
    const close = text.lastIndexOf(")");
    let head = text.slice(0, open).trim();
    const body = text.slice(open + 1, close).trim();
    const inner = head.endsWith("!inner");
    if (inner) head = head.slice(0, -"!inner".length).trim();
    const nested = body === "*" || body === "" ? { columns: [], embeds: [] } : parseClause(body);
    embeds.push({ table: head, columns: nested.columns, inner, embeds: nested.embeds });
  };

  for (const char of source) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      flush(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  flush(buffer);
  return { columns, embeds };
}

function selectList(clause: SelectClause, table: string): string {
  if (clause.columns.length === 0) return `${quote(table)}.*`;
  return clause.columns.map((c) => `${quote(table)}.${quote(c)}`).join(", ");
}

function filterSql(filter: Filter, table: string, params: unknown[]): string {
  const col = `${quote(table)}.${quote(filter.column)}`;
  const push = (value: unknown) => {
    params.push(toSqlValue(table, filter.column, value));
    return "?";
  };

  switch (filter.kind) {
    case "eq":
      return filter.value === null ? `${col} IS NULL` : `${col} = ${push(filter.value)}`;
    case "neq":
      return filter.value === null ? `${col} IS NOT NULL` : `${col} <> ${push(filter.value)}`;
    case "gt":
      return `${col} > ${push(filter.value)}`;
    case "gte":
      return `${col} >= ${push(filter.value)}`;
    case "lt":
      return `${col} < ${push(filter.value)}`;
    case "lte":
      return `${col} <= ${push(filter.value)}`;
    case "like":
      // SQLite's LIKE has no default escape character, so `escapeLike`'s
      // backslashes are literal unless the clause names one. Without `ESCAPE`,
      // a search for a value containing `_` would match any character there.
      return `${col} LIKE ${push(filter.value)} ESCAPE '\\'`;
    case "ilike":
      // SQLite's LIKE is already case-insensitive for ASCII; `lower()` on both
      // sides also folds the Latin text the app searches on.
      return `lower(${col}) LIKE lower(${push(filter.value)}) ESCAPE '\\'`;
    case "is":
      return filter.value === null ? `${col} IS NULL` : `${col} IS ${push(filter.value)}`;
    case "contains": {
      // A jsonb/array `@>` becomes a JSON containment test over the text column.
      const needle = JSON.stringify(filter.value);
      params.push(needle);
      return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE json_each.value IN (SELECT value FROM json_each(?)))`;
    }
    case "in": {
      const list = Array.isArray(filter.value) ? filter.value : [filter.value];
      if (list.length === 0) return "0 = 1";
      return `${col} IN (${list.map((v) => push(v)).join(", ")})`;
    }
    case "not": {
      const inner = filter.value as Filter;
      return `NOT (${filterSql(inner, table, params)})`;
    }
    case "or": {
      const group = filter.value as Filter[];
      if (group.length === 0) return "0 = 1";
      return `(${group.map((f) => filterSql(f, table, params)).join(" OR ")})`;
    }
    default:
      return "1 = 1";
  }
}

export function buildWhere(filters: Filter[], table: string): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  if (filters.length === 0) return { sql: "", params };
  const parts = filters.map((f) => filterSql(f, table, params));
  return { sql: ` WHERE ${parts.join(" AND ")}`, params };
}

/**
 * The embed table a filter's dotted column points at, if it names one of the
 * query's embeds. PostgREST lets a caller filter an embedded relation's column
 * (`order_items.select("…, orders!inner (created_at)").gte("orders.created_at", …)`);
 * the column lives on the child table, which is fetched separately, so the main
 * SELECT cannot carry it. Recognising the target lets the builder route it to
 * the child query instead of emitting a column the parent table does not have.
 */
export function embedFilterTarget(filter: Filter, embedTables: string[]): string | null {
  const dot = filter.column.indexOf(".");
  if (dot === -1) return null;
  const prefix = filter.column.slice(0, dot);
  return embedTables.includes(prefix) ? prefix : null;
}

/** True when any filter targets an embedded relation rather than the base table. */
export function hasEmbedFilters(filters: Filter[], embedTables: string[]): boolean {
  return filters.some((f) => embedFilterTarget(f, embedTables) !== null);
}

/**
 * The filter clause for one embedded relation's child query, with the parent
 * prefix stripped so `orders.created_at` becomes `"orders"."created_at"` against
 * the child table. Returns an `AND`-prefixed fragment (or empty) so it appends to
 * the query's existing `WHERE … IN (…)` rather than starting a second `WHERE`.
 */
export function buildEmbedWhere(
  filters: Filter[],
  embedTable: string,
): { sql: string; params: unknown[] } {
  const scoped = filters
    .filter((f) => embedFilterTarget(f, [embedTable]) !== null)
    .map((f) => ({ ...f, column: f.column.slice(embedTable.length + 1) }));
  if (scoped.length === 0) return { sql: "", params: [] };
  const params: unknown[] = [];
  const parts = scoped.map((f) => filterSql(f, embedTable, params));
  return { sql: ` AND ${parts.join(" AND ")}`, params };
}

export function buildOrder(terms: OrderTerm[], table: string): string {
  if (terms.length === 0) return "";
  const parts = terms.map(
    (t) => `${quote(table)}.${quote(t.column)} ${t.ascending ? "ASC" : "DESC"}`,
  );
  return ` ORDER BY ${parts.join(", ")}`;
}

export function buildLimit(limit: number | null, offset: number | null): string {
  if (limit === null && offset === null) return "";
  const take = limit ?? -1;
  const skip = offset ?? 0;
  return ` LIMIT ${Number(take)} OFFSET ${Number(skip)}`;
}

/**
 * A SELECT, optionally with one embedded relation.
 *
 * The embed is fetched separately and attached in JS rather than joined: a join
 * would repeat the parent row per child, and the app expects PostgREST's nested
 * shape (`row.order_items` as an array), not flattened columns. Two queries
 * against D1 are cheap and the shape stays identical.
 */
export function buildSelect(options: {
  table: string;
  clause: SelectClause;
  filters: Filter[];
  orders: OrderTerm[];
  limit: number | null;
  offset: number | null;
  count: boolean;
}): { sql: string; params: unknown[]; countSql: string | null; countParams: unknown[] } {
  const { table, clause, filters, orders, limit, offset, count } = options;
  const where = buildWhere(filters, table);
  const sql =
    `SELECT ${selectList(clause, table)} FROM ${quote(table)}` +
    where.sql +
    buildOrder(orders, table) +
    buildLimit(limit, offset);
  const countSql = count ? `SELECT count(*) AS count FROM ${quote(table)}${where.sql}` : null;
  return { sql, params: where.params, countSql, countParams: where.params };
}

export type WriteRow = Record<string, unknown>;

/**
 * The columns a write supplies. `current_restaurant_id()` has no SQLite
 * equivalent, so the shim fills it, exactly as the Postgres default did.
 */
const RESTAURANT_SCOPED = new Set([
  "categories", "menu_items", "announcements", "faqs", "page_content", "page_seo",
  "delivery_zones", "offers", "orders", "profiles",
]);

export function prepareRow(
  table: string,
  row: WriteRow,
  restaurantId: string,
  { insert }: { insert: boolean },
): WriteRow {
  const out: WriteRow = { ...row };
  if (insert && RESTAURANT_SCOPED.has(table) && out.restaurant_id === undefined) {
    out.restaurant_id = restaurantId;
  }
  return out;
}

export function buildInsert(
  table: string,
  rows: WriteRow[],
  restaurantId: string,
  conflictTarget?: string[],
): { sql: string; params: unknown[] } {
  const prepared = rows.map((r) => prepareRow(table, r, restaurantId, { insert: true }));
  // The union of the columns keeps a batch where rows differ from producing a
  // short INSERT, filling the gaps with NULL.
  const columns = Array.from(new Set(prepared.flatMap((r) => Object.keys(r))));
  const params: unknown[] = [];
  const valuesSql = prepared
    .map(
      (row) =>
        `(${columns
          .map((c) => {
            params.push(toSqlValue(table, c, row[c]));
            return "?";
          })
          .join(", ")})`,
    )
    .join(", ");

  let sql = `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES ${valuesSql}`;
  if (conflictTarget && conflictTarget.length > 0) {
    const target = conflictTarget.map(quote).join(", ");
    const updates = columns
      .filter((c) => !conflictTarget.includes(c))
      .map((c) => `${quote(c)} = excluded.${quote(c)}`)
      .join(", ");
    sql += ` ON CONFLICT (${target}) DO UPDATE SET ${updates}`;
  }
  return { sql, params };
}

export function buildUpdate(
  table: string,
  patch: WriteRow,
  filters: Filter[],
  restaurantId: string,
): { sql: string; params: unknown[] } {
  const row = prepareRow(table, patch, restaurantId, { insert: false });
  const params: unknown[] = [];
  const sets = Object.keys(row).map((c) => {
    params.push(toSqlValue(table, c, row[c]));
    return `${quote(c)} = ?`;
  });
  const where = buildWhere(filters, table);
  return {
    sql: `UPDATE ${quote(table)} SET ${sets.join(", ")}${where.sql}`,
    params: [...params, ...where.params],
  };
}

export function buildDelete(
  table: string,
  filters: Filter[],
): { sql: string; params: unknown[] } {
  const where = buildWhere(filters, table);
  return { sql: `DELETE FROM ${quote(table)}${where.sql}`, params: where.params };
}

/** Columns with a `created_at`/`updated_at` the shim stamps on write. */
export const STAMPED_TABLES = new Set([
  "categories", "menu_items", "orders", "profiles", "addresses", "conversations",
  "customer_notes", "delivery_zones", "announcements", "faqs", "offers",
  "page_content", "page_seo", "restaurants", "agent_threads",
]);

/**
 * Tables carrying `updated_by`, stamped from the request context.
 *
 * Postgres filled this from `auth.uid()` inside its triggers; SQLite has no such
 * function, so the acting user rides along on the row. Only `orders` needs it
 * today — the status trigger writes `changed_by` from it — but the set is here so
 * the rule is stated once.
 */
export const ACTOR_TABLES = new Set(["orders"]);

export function stampActor(
  table: string,
  row: WriteRow,
  actorId: string | null,
  { insert }: { insert: boolean },
): WriteRow {
  if (insert || !actorId || !ACTOR_TABLES.has(table)) return row;
  if (row.updated_by !== undefined) return row;
  return { ...row, updated_by: actorId };
}

export function stampTimestamps(table: string, row: WriteRow, { insert }: { insert: boolean }): WriteRow {
  if (!STAMPED_TABLES.has(table)) return row;
  const out = { ...row };
  const now = nowIso();
  if (insert && out.created_at === undefined) out.created_at = now;
  out.updated_at = now;
  return out;
}

export { newUuid };
