import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The console order siren must survive the browser's autoplay policy.
 *
 * A page cannot make sound until the visitor has interacted, so a `resume()` on
 * a context created before any gesture is refused by the browser. If the alarm
 * simply attaches its start to that one refused promise, the siren is lost for
 * good: the order stays pending, nothing re-arms it, and the console is silent
 * while the alert bar says an order is waiting. This is exactly the "the sound
 * does not work" report.
 *
 * These tests drive the real `lib/sound/ting` module against a fake AudioContext
 * that refuses `resume()` until the test flips it on, mimicking a browser before
 * the first pointer/key gesture. They assert that unlocking the audio (which the
 * watcher does on the first gesture) re-arms a pending alarm.
 */

class FakeParam {
  value = 0;
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  type = "sine";
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  connect() {}
  start() {}
  stop() {}
}

class FakeContext {
  static last: FakeContext | null = null;
  state: "suspended" | "running" = "suspended";
  currentTime = 0;
  destination = new FakeNode();
  allowed = false;

  constructor() {
    FakeContext.last = this;
  }

  /** Simulate the browser granting audio after a real user gesture. */
  allow(): void {
    this.allowed = true;
  }

  createGain() {
    return new FakeNode();
  }
  createDynamicsCompressor() {
    return new FakeNode();
  }
  createOscillator() {
    return new FakeNode();
  }

  resume(): Promise<void> {
    if (!this.allowed) {
      // What a browser does when there has been no gesture yet.
      return Promise.reject(new Error("NotAllowedError"));
    }
    this.state = "running";
    return Promise.resolve();
  }
}

function installBrowser(): void {
  (globalThis as unknown as { window: unknown }).window = {
    AudioContext: FakeContext,
    localStorage: { getItem: () => null, setItem: () => {} },
  };
}

async function loadTing() {
  vi.resetModules();
  return import("@/lib/sound/ting");
}

/** Let queued promise callbacks (the resume chain) run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeContext.last = null;
  installBrowser();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("order alarm survives the autoplay policy", () => {
  it("re-arms a pending alarm when the audio is unlocked", async () => {
    const ting = await loadTing();

    // An order arrives before the operator has touched the page.
    ting.startOrderAlarm();
    await settle();
    expect(ting.isOrderAlarmRunning()).toBe(false);

    // The operator's first gesture unlocks audio.
    FakeContext.last!.allow();
    ting.unlockAudio();
    await settle();

    expect(ting.isOrderAlarmRunning()).toBe(true);
    ting.stopOrderAlarm();
  });

  it("does not start the siren on unlock when the alarm was stopped", async () => {
    const ting = await loadTing();

    ting.startOrderAlarm();
    ting.stopOrderAlarm();

    FakeContext.last!.allow();
    ting.unlockAudio();
    await settle();

    expect(ting.isOrderAlarmRunning()).toBe(false);
  });

  it("starts immediately when the audio is already unlocked", async () => {
    const ting = await loadTing();

    // First gesture creates the context; the browser then grants audio.
    ting.unlockAudio();
    FakeContext.last!.allow();
    ting.unlockAudio();
    await settle();
    expect(FakeContext.last!.state).toBe("running");

    ting.startOrderAlarm();
    await settle();

    expect(ting.isOrderAlarmRunning()).toBe(true);
    ting.stopOrderAlarm();
  });
});
