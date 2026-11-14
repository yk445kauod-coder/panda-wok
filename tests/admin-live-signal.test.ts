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
 * The console's live signal rides the public `ops-orders` broadcast.
 *
 * A trigger on `orders` and `order_status_history` sends a content-free ping to
 * that channel, which needs no session and is what actually arrives on a
 * gate-cookie socket. A live probe confirmed the split: the same anonymous
 * socket received the broadcast and zero `postgres_changes` events.
 *
 * The row-level `postgres_changes` branch is what caused the "new orders do not
 * appear until I refresh" bug, and must not come back: it reported SUBSCRIBED
 * while delivering nothing, so the hook believed realtime was live and let the
 * boards' fallback poll relax from 8 s to 120 s — freezing the boards. The hook
 * therefore subscribes to the broadcast only, never to `postgres_changes`, and
 * never mints a session for the console to enable one.
 */
describe("console live signal", () => {
  it("subscribes to the public broadcast, never a row-level feed", () => {
    const hook = readFileSync(
      join(ROOT, "src/lib/live/use-ops-signal.ts"),
      "utf8",
    );
    expect(hook).toMatch(/"broadcast"/);
    expect(hook).toMatch(/table:\s*"orders"|OPS_CHANNEL/);
    // The silent row-level branch is exactly what must not return: no
    // `postgres_changes` subscription and no session lookup to gate it.
    expect(hook).not.toMatch(/\.on\(\s*"postgres_changes"/);
    expect(hook).not.toMatch(/getSession\(\)/);
  });

  it("mints no Supabase session for the console", () => {
    // The unlock action stays cheap.
    const action = readFileSync(
      join(ROOT, "src/lib/actions/admin-gate.ts"),
      "utf8",
    );
    expect(action).not.toMatch(/mintStaffSession/);

    // And the console no longer upgrades itself to a staff session at all.
    const mint = readFileSync(
      join(ROOT, "src/lib/auth/staff-session.ts"),
      "utf8",
    );
    expect(mint).not.toMatch(/generateLink|verifyOtp/);
  });

  it("does not reload the page on unlock (a reload kills the audio gesture)", () => {
    const form = readFileSync(
      join(ROOT, "src/components/admin/admin-gate-form.tsx"),
      "utf8",
    );
    expect(form).not.toMatch(/window\.location\.reload\(/);
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
