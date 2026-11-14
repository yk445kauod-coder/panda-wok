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

/**
 * The console's polling must be one timer per tab, not one per component.
 *
 * Before: the shell's alert watcher polled on every page *and* the orders page
 * polled the same endpoint on its own timer, so an idle orders tab spent two
 * Worker invocations every 8 s — ~20k a day, measured at 23,682 on a single day
 * for one admin, against a 100k/day Free-plan budget shared with the site.
 *
 * The fix is a single shared store (`ops-sync`) that owns the one visible-only
 * timer, does the one alert read, and dispatches `panda-wok:refresh` so pages
 * that fetch their own JSON re-read on the same beat. The boards and the feed
 * must therefore not run polls of their own.
 */
describe("console polling is single-source", () => {
  const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

  it("owns exactly one timer, in the shared ops store", () => {
    const store = read("src/lib/live/ops-sync.ts");
    expect(store).toMatch(/startVisiblePoll\(/);
    expect(store).toMatch(/getOpsLive\(\)/);
    // The store is the one place that reads the pending alerts on a schedule.
    expect(store).toMatch(/listPendingOrderAlertsAction/);
  });

  it("does not let the orders board or the kitchen board poll on their own", () => {
    for (const file of [
      "src/components/admin/pages/orders-list.tsx",
      "src/components/admin/kitchen-board.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/useAdminPoll\(/);
      expect(source).not.toMatch(/startVisiblePoll\(/);
    }
  });

  it("drives the alert watcher from the shared store, not a local poll", () => {
    const watcher = read("src/components/admin/order-alert-watcher.tsx");
    expect(watcher).toMatch(/useOpsPendingOrders\(/);
    expect(watcher).not.toMatch(/startVisiblePoll\(/);
    expect(watcher).not.toMatch(/listPendingOrderAlertsAction/);
  });

  it("keeps the shell watcher off every non-orders page's traffic budget", () => {
    // The watcher is mounted once in the shell; it must not import a poller that
    // would fire on pages with no board of their own.
    const shell = read("src/components/admin/admin-shell.tsx");
    expect(shell).toMatch(/OrderAlertWatcher/);
  });
});
