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
 * The console's live signal now rides a real Supabase session.
 *
 * The unlock action mints one (`mintStaffSession`), so the browser holds a
 * token and the staff RLS policies — which resolve through `auth.uid()` — let a
 * row-level `postgres_changes` subscription deliver. That is the fast path. The
 * public `ops-orders` broadcast stays as the fallback for when no session is
 * present, and the poll remains the net for a socket that dies.
 *
 * What must not come back is the old bug: a *silent* row-level subscription with
 * no session behind it, which reported SUBSCRIBED while delivering nothing and
 * left the boards frozen. So the hook must gate the row-level branch on a
 * session, and the session has to be minted at unlock.
 */
describe("console live signal", () => {
  it("gates the row-level subscription on a session", () => {
    const hook = readFileSync(
      join(ROOT, "src/lib/live/use-ops-signal.ts"),
      "utf8",
    );
    expect(hook).toMatch(/getSession\(\)/);
    expect(hook).toMatch(/postgres_changes/);
    expect(hook).toMatch(/table:\s*"orders"/);
    // The row-level branch is chosen by the session, never taken unconditionally.
    expect(hook).toMatch(/data\.session\s*\?/);
    // And the no-session path still falls back to the content-free broadcast.
    expect(hook).toMatch(/"broadcast"/);
  });

  it("mints a staff session when the console is unlocked", () => {
    const action = readFileSync(
      join(ROOT, "src/lib/actions/admin-gate.ts"),
      "utf8",
    );
    expect(action).toMatch(/mintStaffSession/);

    const mint = readFileSync(
      join(ROOT, "src/lib/auth/staff-session.ts"),
      "utf8",
    );
    expect(mint).toMatch(/generateLink/);
    expect(mint).toMatch(/verifyOtp/);
  });

  it("ships a public broadcast trigger on orders and its status history", () => {
    const migration = readFileSync(
      join(ROOT, "supabase/migrations/20261114000200_ops_order_signal.sql"),
      "utf8",
    );
    // Public (private = false) is the point of the fallback: it needs no session.
    expect(migration).toMatch(/realtime\.send\(/);
    expect(migration).toMatch(/false\s*\);/);
    expect(migration).toMatch(/on public\.orders/);
    expect(migration).toMatch(/on public\.order_status_history/);
  });
});
