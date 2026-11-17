/**
 * Visibility-aware polling for the ops console.
 *
 * Why this exists: the console runs on a Cloudflare Worker with a per-request
 * CPU/subrequest cap on the Free plan. Every poll is a full Worker invocation —
 * a server-action round trip that re-derives the gate, the profile and the
 * orders — so one idle admin tab left open all shift, times every admin on the
 * team, spends the budget the whole project shares with the customer site and
 * the account's other Workers. The live analytics show it: this Worker alone was
 * answering ~20k subrequests a day, and 728 requests a day were dying at
 * `exceededResources` (Error 1102, the 10 ms CPU cap).
 *
 * A backgrounded tab cannot be watched, so polling it is pure cost. This helper
 * clears the timer while the document is hidden and restarts it — catching up
 * once, immediately — when the tab becomes visible again. A hidden tab therefore
 * makes *zero* requests instead of one every few seconds. A visible tab keeps
 * its cadence exactly as before.
 *
 * Kept free of React and of the DOM globals so the schedule is unit-testable.
 */

export type TimerHost = {
  setInterval: (handler: () => void, ms: number) => number;
  clearInterval: (handle: number) => void;
};

/**
 * A visibility source: how to ask "visible now?" and how to subscribe to
 * changes. Defaults to the document events; a test passes its own.
 */
export type VisibilitySource = {
  isVisible: () => boolean;
  onChange: (listener: () => void) => () => void;
};

export function documentVisibility(): VisibilitySource {
  return {
    isVisible: () =>
      typeof document === "undefined" || document.visibilityState === "visible",
    onChange: (listener) => {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

/** The browser default. `window.setInterval` returns a number, as callers expect. */
export function defaultTimerHost(): TimerHost {
  return {
    setInterval: (handler, ms) => window.setInterval(handler, ms),
    clearInterval: (handle) => window.clearInterval(handle),
  };
}

/**
 * Calls `tick` every `intervalMs`, but only while the document is visible.
 *
 * The first tick happens one interval after `start`, never immediately, so the
 * server render the caller already has stays the source of truth for the first
 * paint — unchanged from every poller this replaces. Returns a stop function
 * that clears both the timer and the visibility listener.
 *
 * Re-entrancy is the caller's concern, matching the existing pollers: each
 * already guards a tick that is still in flight.
 *
 * `tick` may report its outcome by returning (or resolving to) `false` for a
 * *failed* read and anything else for a success. A failed read backs the next
 * interval off geometrically up to `maxIntervalMs` and a success resets it, so a
 * Worker that is failing — a cold isolate, a 1102, an origin outage — is not
 * hammered once per base interval by every open tab. The backoff is jittered so
 * that a fleet of tabs does not retry in lockstep and re-create the very spike
 * the backoff exists to avoid. A `tick` that returns nothing is treated as a
 * success, so the plain pollers keep their exact previous behaviour.
 */
export type PollTickResult = void | boolean | Promise<void | boolean>;

export type PollOptions = {
  /**
   * Ceiling for the backoff, in ms. Defaults to 12× the base interval, capped at
   * 30 minutes, so a poller that has been failing for a while settles onto a
   * cheap cadence instead of stopping (a stopped poller never recovers a stale
   * page).
   */
  maxIntervalMs?: number;
  /** Multiplier applied per consecutive failure. */
  backoffFactor?: number;
  /**
   * Randomness applied to the *backoff* interval only (never the base one), as a
   * fraction: 0.25 means up to ±25 %. Keeps a fleet of tabs from synchronising.
   */
  jitter?: number;
  /** Injectable randomness, for tests. Defaults to `Math.random`. */
  random?: () => number;
};

export function startVisiblePoll(
  tick: () => PollTickResult,
  intervalMs: number | (() => number),
  source: VisibilitySource = documentVisibility(),
  host: TimerHost = defaultTimerHost(),
  options: PollOptions = {},
): () => void {
  let handle: number | null = null;
  let failures = 0;

  const random = options.random ?? Math.random;
  const factor = options.backoffFactor ?? 2;
  const jitter = Math.max(0, options.jitter ?? 0.25);

  // The interval may be a function so the cadence can be re-read on every
  // reschedule (e.g. relax once a realtime signal is confirmed live) without the
  // caller tearing down and re-arming the poll.
  const baseInterval = () => (typeof intervalMs === "function" ? intervalMs() : intervalMs);

  const currentInterval = () => {
    const base = baseInterval();
    if (failures === 0) return base;
    const cap = options.maxIntervalMs ?? Math.min(base * 12, 30 * 60 * 1000);
    const grown = Math.min(base * factor ** failures, cap);
    if (jitter === 0) return grown;
    // Symmetric jitter around the grown interval: (1 ± jitter).
    const spread = 1 + (random() * 2 - 1) * jitter;
    return Math.max(base, Math.round(grown * spread));
  };

  const stopTimer = () => {
    if (handle !== null) {
      host.clearInterval(handle);
      handle = null;
    }
  };

  /**
   * Runs one tick and records its outcome for the backoff. A synchronous tick
   * updates `failures` before the caller re-arms, so the very next interval
   * reflects it; an asynchronous tick (a `fetch`) updates it when it settles,
   * which the next re-arm then reads. A rejected tick counts as a failure.
   */
  const runTick = () => {
    let result: PollTickResult;
    try {
      result = tick();
    } catch {
      failures += 1;
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<void | boolean>).then(
        (value) => {
          failures = value === false ? failures + 1 : 0;
        },
        () => {
          failures += 1;
        },
      );
    } else {
      failures = result === false ? failures + 1 : 0;
    }
  };

  const startTimer = () => {
    if (handle !== null) return;
    handle = host.setInterval(() => {
      // Re-arm on each tick so a changed interval (or a fresh backoff) takes
      // effect immediately for the next tick. Re-arming before the tick settles
      // also means a hung read cannot silently stop the poll.
      stopTimer();
      runTick();
      startTimer();
    }, currentInterval());
  };

  const sync = () => {
    if (source.isVisible()) {
      // Becoming visible should not wait a full interval for the first update,
      // so catch up once and then resume the cadence. A visible catch-up is also
      // a fresh signal, so it clears the backoff — a tab returning to the
      // foreground re-tries at the base cadence instead of the last one it
      // backed off to.
      if (handle === null) {
        failures = 0;
        runTick();
        startTimer();
      } else {
        startTimer();
      }
    } else {
      stopTimer();
    }
  };

  if (source.isVisible()) startTimer();
  const unsubscribe = source.onChange(sync);

  return () => {
    stopTimer();
    unsubscribe();
  };
}
