/**
 * Two-note "ting ting" chime for the ops console, synthesised with the WebAudio
 * API so there is no binary asset to ship, cache or decode.
 *
 * Scope: this is **admin-only**. The customer site is deliberately silent and
 * must stay that way — no audio is imported anywhere under `(site)`. The only
 * caller is the kitchen board, where a new ticket has to be audible from across
 * the room when nobody is looking at the screen.
 *
 * The AudioContext is created lazily on first play and reused; browsers refuse
 * to start audio before a user gesture, so a failed resume is swallowed rather
 * than thrown. Preference is remembered in localStorage so a kitchen that finds
 * it annoying can turn it off once.
 */

const STORAGE_KEY = "panda-wok.admin.sound";

let context: AudioContext | null = null;

// A tiny subscribable store so React can read the preference through
// `useSyncExternalStore` — localStorage is not available during SSR, and
// reading it in an effect to seed state trips the set-state-in-effect lint.
const listeners = new Set<() => void>();

function readPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

let enabled = readPreference();

export function isSoundEnabled(): boolean {
  return enabled;
}

/** Subscribe to preference changes (for `useSyncExternalStore`). */
export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** SSR snapshot: assume on, which matches the default and avoids a mismatch. */
export function soundServerSnapshot(): boolean {
  return true;
}

export function setSoundEnabled(next: boolean): void {
  enabled = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Private mode or a locked-down browser: the preference just does not stick.
    }
  }
  listeners.forEach((listener) => listener());
  if (next) playTing();
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // Safari still ships the prefixed constructor.
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  return context;
}

/** One short bell: a triangle partial plus a fast decay envelope. */
function strike(ctx: AudioContext, frequency: number, at: number, gain: number): void {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  // A near-instant attack and a ~0.35 s tail read as a soft "ting" rather than
  // a click, which is what carries across a noisy kitchen.
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
  oscillator.connect(envelope);
  envelope.connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + 0.4);
}

/** The rising two-tone alert: E6 then A6, ~120 ms apart. */
export function playTing(): void {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;
  const start = () => {
    const now = ctx.currentTime;
    strike(ctx, 1318.51, now, 0.16);
    strike(ctx, 1760.0, now + 0.12, 0.13);
  };
  if (ctx.state === "suspended") {
    void ctx.resume().then(start).catch(() => undefined);
  } else {
    start();
  }
}

/** A single lower tone for a rejection or a failed action. */
export function playBuzz(): void {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;
  const start = () => strike(ctx, 196.0, ctx.currentTime, 0.12);
  if (ctx.state === "suspended") {
    void ctx.resume().then(start).catch(() => undefined);
  } else {
    start();
  }
}
