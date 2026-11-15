/**
 * A `D1Database` backed by `node:sqlite`.
 *
 * The shim is only worth having if it produces the same rows the app already
 * expects, and the way to know that is to run the real SQL against a real
 * database. `node:sqlite` (Node 22+) is a genuine SQLite engine, so a test can
 * apply `migrations/0001_init.sql`, load the catalogue, and exercise the builder
 * end to end — no mock, no fake result set.
 */

import { DatabaseSync } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result, D1Value } from "@/lib/d1/database";

class SqliteStatement implements D1PreparedStatement {
  private values: D1Value[] = [];

  constructor(private readonly db: DatabaseSync, private readonly query: string) {}

  bind(...values: D1Value[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    try {
      const statement = this.db.prepare(this.query);
      const results = statement.all(...(this.values as never[])) as T[];
      return { results, success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.all<Record<string, unknown>>();
    const row = result.results?.[0];
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    try {
      const statement = this.db.prepare(this.query);
      const info = statement.run(...(this.values as never[]));
      return {
        success: true,
        meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export class SqliteD1 implements D1Database {
  constructor(private readonly db: DatabaseSync) {}

  prepare(query: string): D1PreparedStatement {
    return new SqliteStatement(this.db, query);
  }

  async batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    // D1 runs a batch as one transaction; SQLite does the same here so a failure
    // in the middle rolls the whole thing back, matching production semantics.
    this.db.exec("BEGIN");
    try {
      const results: D1Result<T>[] = [];
      for (const statement of statements) results.push(await statement.run<T>());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    this.db.exec(query);
    return { count: 0, duration: 0 };
  }
}

/** An in-memory D1 with the real schema applied. */
export function createTestDatabase(schemaSql: string): SqliteD1 {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaSql);
  return new SqliteD1(db);
}
