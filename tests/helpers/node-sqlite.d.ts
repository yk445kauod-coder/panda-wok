/**
 * `node:sqlite` ships with Node 22+ but its types are not in the version of
 * @types/node this project pins, and the module is only used by the test helper.
 * Declaring the little surface the helper needs keeps `tsc --noEmit` clean
 * without pulling in a newer @types/node for the whole app.
 */
declare module "node:sqlite" {
  export class StatementSync {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
