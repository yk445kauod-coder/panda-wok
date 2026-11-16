import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/**
 * The console's first-load weight is a running budget, not a one-off fix.
 *
 * `chart.js` is ~65 KB gzip and only the dashboard and analytics pages draw a
 * chart, yet a static import once put it on all seventeen console routes. The
 * dictionaries had the same shape: both languages were imported statically, so
 * every session downloaded the Arabic dictionary even when it read English.
 *
 * These tests pin the two rules that keep those off the shared shell. They read
 * the source rather than a build so they run fast and fail with a file name.
 */
describe("console first-load budget", () => {
  it("loads every chart through the lazy wrapper, never directly", () => {
    const charts = [
      "trend-chart",
      "donut-chart",
      "bar-list",
      "gauge-chart",
      "radar-chart",
      "heatmap",
      "sparkline",
    ];
    for (const file of walk(join(ROOT, "src/components"))) {
      // The wrapper is the one place allowed to reach the real modules.
      if (file.endsWith("charts/lazy.tsx")) continue;
      const source = readFileSync(file, "utf8");
      for (const chart of charts) {
        expect(
          source.includes(`@/components/charts/${chart}"`),
          `${file} imports ${chart} directly; use @/components/charts/lazy`,
        ).toBe(false);
      }
    }
  });

  it("keeps the chart wrapper itself the only importer of the real modules", () => {
    const lazy = read("src/components/charts/lazy.tsx");
    expect(lazy).toMatch(/next\/dynamic/);
    expect(lazy).toMatch(/ssr:\s*false/);
    // Every chart the console uses must be exposed here, or a call site would
    // fall back to a static import and undo the split.
    for (const name of [
      "TrendChart",
      "DonutChart",
      "BarList",
      "GaugeChart",
      "RadarChart",
      "Heatmap",
      "Sparkline",
    ]) {
      expect(lazy).toContain(`export const ${name}`);
    }
  });

  it("ships one dictionary per session, not both", () => {
    // The console picks the active language at runtime; the other dictionary is
    // a dynamic import so it is not in the shared chunk.
    const adminI18n = read("src/components/admin/admin-i18n.tsx");
    expect(adminI18n).toMatch(/import\(\s*"@\/lib\/i18n\/dictionaries\/ar"\s*\)/);
    expect(adminI18n).not.toMatch(/^import \{ ar \} from/m);
    // English is the static fallback (the default locale), so only Arabic is
    // allowed to be the deferred one.
    expect(adminI18n).toMatch(/^import \{ en/m);
  });

  it("keeps the fatal boundary free of dictionary imports", () => {
    // `global-error` is an entry point of the root layout, so a dictionary
    // import there lands in the first-load bundle of every route, admin
    // included. Its handful of strings are inlined instead.
    const boundary = read("src/app/global-error.tsx");
    expect(boundary).not.toMatch(/@\/lib\/i18n\/dictionaries/);
  });
});

/**
 * The console's live beat must stay opt-in.
 *
 * The shared timer and every realtime ping fire `panda-wok:live`. Before the
 * opt-in flag, *every* open page re-fetched its own endpoint on that beat, so a
 * tab parked on Settings or Exports spent the same Worker invocations as one
 * watching the orders board. Only boards whose content changes with an order
 * may subscribe; everything else re-reads only after a mutation.
 */
describe("console live beat is opt-in", () => {
  it("gates the live event behind an explicit flag", () => {
    const client = read("src/lib/admin/client.ts");
    expect(client).toMatch(/panda-wok:live/);
    expect(client).toMatch(/if \(!live\) return;/);
    // A mutation must still always re-read, whatever the flag.
    expect(client).toMatch(/panda-wok:refresh/);
  });

  it("fires the live event from the one shared store", () => {
    const store = read("src/lib/live/ops-sync.ts");
    expect(store).toMatch(/new Event\("panda-wok:live"\)/);
  });

  it("opts in only the boards an order can change", () => {
    const livePages = [
      "src/components/admin/pages/orders-list.tsx",
      "src/components/admin/pages/kitchen.tsx",
      "src/components/admin/pages/dashboard.tsx",
      "src/components/admin/pages/order-detail.tsx",
    ];
    for (const page of livePages) {
      expect(read(page), `${page} must opt in to the live beat`).toMatch(
        /live:\s*true/,
      );
    }
  });

  it("leaves the static pages off the beat", () => {
    for (const page of [
      "src/components/admin/pages/settings.tsx",
      "src/components/admin/pages/exports.tsx",
      "src/components/admin/pages/backups.tsx",
      "src/components/admin/pages/content.tsx",
      "src/components/admin/pages/users.tsx",
    ]) {
      expect(read(page), `${page} must not opt in to the live beat`).not.toMatch(
        /live:\s*true/,
      );
    }
  });
});

/**
 * The shared read must not double the console's invocations.
 *
 * Each tick of the console's one timer is a `GET /api/admin/alerts` call, and
 * waking the boards adds a second call to whatever endpoint the open page reads.
 * On the live cadence that doubling is the difference between staying inside the
 * Free plan's 100k/day budget and blowing it, so the decision to wake the boards
 * is pinned: only a real change, a realtime push, or a dropped socket (where the
 * poll is the only signal) may wake them.
 */
describe("shared read does not double the beat", () => {
  it("keeps an idle live tick to the one read", async () => {
    const { shouldWakeBoards } = await import("@/lib/live/ops-sync");
    expect(shouldWakeBoards({ changed: false, forceBoards: false, live: true })).toBe(false);
  });

  it("wakes the boards on a change, a push, or a dropped socket", async () => {
    const { shouldWakeBoards } = await import("@/lib/live/ops-sync");
    expect(shouldWakeBoards({ changed: true, forceBoards: false, live: true })).toBe(true);
    expect(shouldWakeBoards({ changed: false, forceBoards: true, live: true })).toBe(true);
    // Socket down: the poll is the only signal, so every tick must refresh them.
    expect(shouldWakeBoards({ changed: false, forceBoards: false, live: false })).toBe(true);
  });

  it("reads the pending set as an order-independent signature", async () => {
    const { pendingSignature } = await import("@/lib/sound/alert-state");
    expect(pendingSignature([{ id: "b" }, { id: "a" }] as never)).toBe(
      pendingSignature([{ id: "a" }, { id: "b" }] as never),
    );
  });
});
