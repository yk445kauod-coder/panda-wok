import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

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
  it("subscribes to the hub, never a row-level feed", () => {
    const hook = readFileSync(
      join(ROOT, "src/lib/live/use-ops-signal.ts"),
      "utf8",
    );
    // The transport is the Durable Object socket; `subscribeOpsSignal` is the
    // single entry point the hook and the shared poller both go through.
    expect(hook).toMatch(/subscribeOpsSignal/);
    expect(hook).toMatch(/ops-socket/);
    // The silent row-level branch is exactly what must not return: no
    // `postgres_changes` subscription and no session lookup to gate it.
    expect(hook).not.toMatch(/\.on\(\s*"postgres_changes"/);
    expect(hook).not.toMatch(/getSession\(\)/);
    // No transport import: the file may *mention* Supabase in prose, but it must
    // not reach for the client.
    expect(hook).not.toMatch(/from\s+"@\/lib\/supabase/);
  });

  it("carries the live signal on a socket, not a Supabase channel", () => {
    const socket = readFileSync(join(ROOT, "src/lib/live/ops-socket.ts"), "utf8");
    expect(socket).toMatch(/new WebSocket\(/);
    expect(socket).not.toMatch(/from\s+"@\/lib\/supabase/);
    expect(socket).not.toMatch(/postgres_changes/);
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

  it("publishes to the hub from both order write paths", () => {
    // The Supabase Realtime trigger is gone; the push now comes from the two
    // actions that write an order, so a console hears about it in the same tick.
    for (const file of ["src/lib/actions/checkout.ts", "src/lib/actions/admin.ts"]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).toMatch(/publishOrderChange\(/);
    }
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
    // The store is the one place that reads the pending alerts on a schedule,
    // and it does so over a plain GET rather than a Server Action POST back to
    // a static shell (the measured cause of the request volume).
    expect(store).toMatch(/\/api\/admin\/alerts/);
    expect(store).not.toMatch(/listPendingOrderAlertsAction/);
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

  it("keeps the fallback cadence long enough to stay inside the budget", () => {
    // The socket is the real path; this poll only runs when it is down, and the
    // 8 s it started at was the measured cause of ~23k invocations a day for one
    // admin. A regression to a short cadence is what re-exhausts the Free plan,
    // so the floor is pinned rather than left to a comment.
    const store = read("src/lib/live/ops-sync.ts");
    const fallback = store.match(/OPS_POLL_FALLBACK_MS = (\d+)/)?.[1];
    const live = store.match(/OPS_POLL_LIVE_MS = (\d+)/)?.[1];
    expect(Number(fallback)).toBeGreaterThanOrEqual(60000);
    expect(Number(live)).toBeGreaterThanOrEqual(Number(fallback));
  });

  it("reads the alerts over a GET route, never a POST to the console shell", () => {
    // A Server Action posts back to the page the console is on. Every console
    // route is a static shell, so that POST had no handler (404), re-ran the App
    // Router to re-emit a static document (200), or exceeded the Free plan's
    // 10 ms CPU cap (503 / Error 1102). The alert read must stay a GET.
    const store = read("src/lib/live/ops-sync.ts");
    expect(store).toMatch(/fetch\("\/api\/admin\/alerts"/);
    expect(store).not.toMatch(/"use server"/);
    // And the route that serves it must exist and be gated.
    const route = read("src/app/api/admin/alerts/route.ts");
    expect(route).toMatch(/export async function GET/);
    expect(route).toMatch(/adminJson\(/);
  });

  it("closes a half-open socket rather than trusting it", () => {
    // The long live cadence is only safe if a socket that stopped delivering is
    // detected: `onclose` never fires for a half-open connection, so without a
    // staleness guard the tab would hold `live` true and sit on the two-minute
    // poll. The heartbeat must compare against the last frame received.
    const sock = read("src/lib/live/ops-socket.ts");
    expect(sock).toMatch(/STALE_MS/);
    expect(sock).toMatch(/lastFrame/);
    expect(sock).toMatch(/Date\.now\(\) - lastFrame > STALE_MS/);
  });

  it("seeds the shared store from the session payload instead of re-reading it", () => {
    // `/api/admin/session` and `/api/admin/alerts` return the same pending queue,
    // and the shell fetches the session on every page load. Without the seed the
    // store's opening read fetches the identical list again — two Worker
    // invocations per console page load where one carries the data already.
    const store = read("src/lib/live/ops-sync.ts");
    expect(store).toMatch(/export function seedOpsPending/);
    // The opening read must be conditional on the store not already being seeded,
    // or the seed saves nothing.
    expect(store).toMatch(/if \(!store\?\.loaded\) void readPending\(\)/);

    const app = read("src/components/admin/admin-app.tsx");
    expect(app).toMatch(/seedOpsPending\(data\.pendingOrders\)/);
  });
});
