import { describe, expect, it, vi } from "vitest";
import {
  startVisiblePoll,
  type TimerHost,
  type VisibilitySource,
} from "@/lib/live/visibility";

/**
 * A fake timer host that records scheduled intervals, plus a manual visibility
 * source, so the poll schedule can be driven without a DOM or real clocks.
 */
function harness(initiallyVisible = true) {
  let visible = initiallyVisible;
  const listeners = new Set<() => void>();
  const intervals: { handler: () => void; ms: number; cleared: boolean }[] = [];

  const host: TimerHost = {
    setInterval: (handler, ms) => {
      intervals.push({ handler, ms, cleared: false });
      return intervals.length - 1;
    },
    clearInterval: (handle) => {
      intervals[handle].cleared = true;
    },
  };
  const source: VisibilitySource = {
    isVisible: () => visible,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const setVisible = (next: boolean) => {
    visible = next;
    for (const listener of listeners) listener();
  };
  // Fire the newest live (un-cleared) interval's handler, as a real timer would.
  const fireLatest = () => {
    const live = [...intervals].reverse().find((i) => !i.cleared);
    live?.handler();
  };

  return { host, source, intervals, setVisible, fireLatest };
}

describe("startVisiblePoll", () => {
  it("schedules an interval and never ticks at start", () => {
    const tick = vi.fn();
    const h = harness();
    startVisiblePoll(tick, 8000, h.source, h.host);

    expect(h.intervals).toHaveLength(1);
    expect(h.intervals[0].ms).toBe(8000);
    expect(tick).not.toHaveBeenCalled();
  });

  it("ticks on each fire while visible", () => {
    const tick = vi.fn();
    const h = harness();
    startVisiblePoll(tick, 8000, h.source, h.host);

    h.fireLatest();
    h.fireLatest();
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("does not schedule at all when starting hidden", () => {
    const tick = vi.fn();
    const h = harness(false);
    startVisiblePoll(tick, 8000, h.source, h.host);

    expect(h.intervals).toHaveLength(0);
    expect(tick).not.toHaveBeenCalled();
  });

  it("stops making requests when the tab goes hidden", () => {
    const tick = vi.fn();
    const h = harness();
    startVisiblePoll(tick, 8000, h.source, h.host);

    h.setVisible(false);
    // The old timer is cleared, so firing it cannot reach the network.
    expect(h.intervals[0].cleared).toBe(true);
    expect(tick).not.toHaveBeenCalled();
  });

  it("catches up once and resumes the cadence when the tab returns", () => {
    const tick = vi.fn();
    const h = harness();
    startVisiblePoll(tick, 8000, h.source, h.host);

    h.setVisible(false);
    h.setVisible(true);
    // One immediate catch-up on return...
    expect(tick).toHaveBeenCalledTimes(1);
    // ...then a fresh interval, not a duplicate.
    const live = h.intervals.filter((i) => !i.cleared);
    expect(live).toHaveLength(1);
    h.fireLatest();
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("does not stack timers when visibility changes repeatedly", () => {
    const h = harness();
    startVisiblePoll(() => {}, 8000, h.source, h.host);

    h.setVisible(false);
    h.setVisible(true);
    h.setVisible(true);
    h.setVisible(false);
    h.setVisible(true);
    expect(h.intervals.filter((i) => !i.cleared)).toHaveLength(1);
  });

  it("stops the timer and unsubscribes on stop", () => {
    const tick = vi.fn();
    const h = harness();
    const stop = startVisiblePoll(tick, 8000, h.source, h.host);

    stop();
    expect(h.intervals[0].cleared).toBe(true);
    // A later visibility change must not restart it.
    h.setVisible(false);
    h.setVisible(true);
    h.fireLatest();
    expect(tick).not.toHaveBeenCalled();
  });

  it("re-reads a function interval on every tick, so the cadence can relax", () => {
    const tick = vi.fn();
    const h = harness();
    let ms = 8000;
    startVisiblePoll(tick, () => ms, h.source, h.host);

    expect(h.intervals[0].ms).toBe(8000);
    // The signal comes up: the next schedule must use the relaxed cadence without
    // the caller tearing the poll down.
    ms = 60000;
    h.fireLatest();
    expect(tick).toHaveBeenCalledTimes(1);
    const live = h.intervals.filter((i) => !i.cleared);
    expect(live).toHaveLength(1);
    expect(live[0].ms).toBe(60000);
  });

  it("backs the cadence off while the origin keeps failing, then resets on success", () => {
    const tick = vi.fn(() => false);
    const h = harness();
    // Jitter disabled so the growth is deterministic for the assertion.
    startVisiblePoll(tick, 8000, h.source, h.host, { jitter: 0 });

    expect(h.intervals[0].ms).toBe(8000);
    // First failure: the next interval doubles.
    h.fireLatest();
    expect(h.intervals.filter((i) => !i.cleared).at(-1)?.ms).toBe(16000);
    // Second failure: it doubles again.
    h.fireLatest();
    expect(h.intervals.filter((i) => !i.cleared).at(-1)?.ms).toBe(32000);

    // A success resets the cadence to the base interval.
    tick.mockReturnValue(true);
    h.fireLatest();
    expect(h.intervals.filter((i) => !i.cleared).at(-1)?.ms).toBe(8000);
  });

  it("caps the backoff instead of backing off without bound", () => {
    const tick = vi.fn(() => false);
    const h = harness();
    startVisiblePoll(tick, 8000, h.source, h.host, { jitter: 0, maxIntervalMs: 20000 });

    for (let i = 0; i < 6; i += 1) h.fireLatest();
    const live = h.intervals.filter((i) => !i.cleared);
    // The cap is the ceiling, so the cadence settles rather than stopping.
    expect(live.at(-1)?.ms).toBe(20000);
  });

  it("treats a rejected tick as a failure and a plain void tick as a success", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("network")));
    const h = harness();
    startVisiblePoll(failing, 8000, h.source, h.host, { jitter: 0 });
    h.fireLatest();
    // Let the rejection settle before the next re-arm reads `failures`.
    await Promise.resolve();
    await Promise.resolve();
    h.fireLatest();
    expect(h.intervals.filter((i) => !i.cleared).at(-1)?.ms).toBe(16000);

    // A tick that returns nothing is a success — the pre-backoff contract, so a
    // plain poller never backs off.
    const plain = vi.fn();
    const h2 = harness();
    startVisiblePoll(plain, 8000, h2.source, h2.host, { jitter: 0 });
    h2.fireLatest();
    h2.fireLatest();
    expect(h2.intervals.filter((i) => !i.cleared).at(-1)?.ms).toBe(8000);
  });

  it("clears the backoff when the tab returns to the foreground", () => {
    const tick = vi.fn(() => false);
    const h = harness();
    startVisiblePoll(tick, 8000, h.source, h.host, { jitter: 0 });

    h.fireLatest();
    h.fireLatest();
    // Two failures have grown the cadence; a return to the foreground is a fresh
    // signal and must try the base cadence again.
    h.setVisible(false);
    tick.mockReturnValue(true);
    h.setVisible(true);
    expect(h.intervals.filter((i) => !i.cleared).at(-1)?.ms).toBe(8000);
  });
});
