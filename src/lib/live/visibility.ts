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
 */
export function startVisiblePoll(
  tick: () => void,
  intervalMs: number,
  source: VisibilitySource = documentVisibility(),
  host: TimerHost = defaultTimerHost(),
): () => void {
  let handle: number | null = null;

  const stopTimer = () => {
    if (handle !== null) {
      host.clearInterval(handle);
      handle = null;
    }
  };

  const startTimer = () => {
    if (handle !== null) return;
    handle = host.setInterval(tick, intervalMs);
  };

  const sync = () => {
    if (source.isVisible()) {
      // Becoming visible should not wait a full interval for the first update,
      // so catch up once and then resume the cadence.
      if (handle === null) tick();
      startTimer();
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
