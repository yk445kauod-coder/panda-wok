import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/**
 * The console opens with a cookie, not a Supabase session, so its browser client
 * is anonymous. A `postgres_changes` subscription on `orders` therefore delivers
 * nothing — the staff RLS policy resolves through `auth.uid()`, and the channel
 * reports SUBSCRIBED regardless. Trusting that made the boards look live while
 * they were frozen. The console must use the public `ops-orders` broadcast
 * instead, so a row-level subscription on `orders` must not come back.
 */
describe("console live signal", () => {
  it("never subscribes to postgres_changes on orders from an admin surface", () => {
    const adminSources = walk(join(ROOT, "src/components/admin")).concat(
      walk(join(ROOT, "src/lib/live")),
    );
    const offenders: string[] = [];

    for (const file of adminSources) {
      const text = readFileSync(file, "utf8");
      const rowLevel = /postgres_changes/.test(text) && /table:\s*"orders"/.test(text);
      if (rowLevel) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it("ships a public broadcast trigger on orders and its status history", () => {
    const migration = readFileSync(
      join(ROOT, "supabase/migrations/20261114000200_ops_order_signal.sql"),
      "utf8",
    );
    // Public (private = false) is the whole point: it needs no session.
    expect(migration).toMatch(/realtime\.send\(/);
    expect(migration).toMatch(/false\s*\);/);
    expect(migration).toMatch(/on public\.orders/);
    expect(migration).toMatch(/on public\.order_status_history/);
  });
});
