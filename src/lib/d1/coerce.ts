/**
 * Value conversion between what the app speaks and what SQLite stores.
 *
 * The schema mapping (see scripts/d1/generate-schema.py) turned Postgres types
 * into SQLite ones: booleans became 0/1, jsonb and arrays became JSON text,
 * timestamptz became TEXT. The app was written against the Postgres shapes, so
 * both directions have to be translated here or `.eq("is_enabled", true)` would
 * never match a stored `1`, and `row.opening_hours.mon` would be a string.
 */

import { BOOLEAN_COLUMNS, JSON_COLUMNS } from "@/lib/d1/schema-meta";
import type { D1Value } from "@/lib/d1/database";

function booleanColumns(table: string): readonly string[] {
  return BOOLEAN_COLUMNS[table] ?? [];
}

function jsonColumns(table: string): readonly string[] {
  return JSON_COLUMNS[table] ?? [];
}

/**
 * A timestamp the way Postgres would have returned it. SQLite's
 * `CURRENT_TIMESTAMP` yields `2026-11-15 10:30:00`, which sorts the same but
 * does not parse as an ISO date, so it is normalised on read.
 */
export function toIsoTimestamp(value: string): string {
  if (value.includes("T")) return value;
  return value.replace(" ", "T") + "Z";
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** JS value -> the value SQLite should hold. */
export function toSqlValue(table: string, column: string, value: unknown): D1Value {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  // Objects and arrays are JSON text; Date is an ISO string.
  if (value instanceof Date) return value.toISOString();
  if (jsonColumns(table).includes(column)) return JSON.stringify(value);
  // Anything else (an array on a column the generator did not flag, a nested
  // object) is still safest as JSON than as `[object Object]`.
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The value SQLite holds -> the JS value the app expects. */
export function fromSqlValue(table: string, column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (booleanColumns(table).includes(column)) return value === 1 || value === true;
  if (jsonColumns(table).includes(column) && typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (typeof value === "string" && ISO_PATTERN.test(value)) return toIsoTimestamp(value);
  return value;
}

export function fromSqlRow<T = Record<string, unknown>>(
  table: string,
  row: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    out[key] = fromSqlValue(table, key, row[key]);
  }
  return out as T;
}

/** `2026-11-15T10:30:00.000Z` — the shape the app writes and reads. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** A v4 UUID, matching the `gen_uuid()` default the schema uses. */
export function newUuid(): string {
  return crypto.randomUUID();
}
