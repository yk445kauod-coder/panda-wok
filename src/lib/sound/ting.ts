/**
 * Two-note "ting ting" chime for the ops console, synthesised with the WebAudio
 * API so there is no binary asset to ship, cache or decode.
 *
 * Scope: this is **admin-only**. The customer site is deliberately silent and
 * must stay that way — no audio is imported anywhere under `(site)`.
 *
 * There are two modes:
 *  - `playTing()` — a single polite chime, used for confirmations and feedback.
 *  - `startOrderAlarm()` / `stopOrderAlarm()` — a loud, repeating two-tone
 *    siren for a new order that has not been acknowledged. It runs until an
 *    operator takes an action (accepts the order or presses Acknowledge),
 *    because a KDS that rings once can be missed from across a kitchen.
 *
 * The AudioContext is created lazily on first play and reused; browsers refuse
 * to start audio before a user gesture, so `unlockAudio()` must be called from
 * a real interaction (a click anywhere in the console does it) before an alarm
 * triggered by a background poll can be heard.
 *
 * Preference is remembered in localStorage so a kitchen that finds it annoying
 * can turn it off once; turning it off also silences a running alarm.
 */

const STORAGE_KEY = "panda-wok.admin.sound";

let context: AudioContext | null = null;
// A single master bus every tone runs through. The order siren is pushed hot so
// it carries across a busy kitchen, and a limiter on the bus stops those peaks
// from clipping into a crackle. The polite `ting` shares the bus at its own
// (much lower) gain, so the limiter only ever engages on the alarm.
let master: GainNode | null = null;

function getMaster(ctx: AudioContext): GainNode {
  if (master) return master;
  const gain = ctx.createGain();
  gain.gain.value = 1;

  const limiter = ctx.createDynamicsCompressor();
  // A safety net, not a compressor: it only bites at the very peaks (where the
  // fundamental and its octave overlap) so the siren stays as loud as the
  // browser allows without clipping into a crackle. The quiet confirmation ting
  // is far below this threshold and passes through untouched.
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  gain.connect(limiter);
  limiter.connect(ctx.destination);
  master = gain;
  return master;
}

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
  else stopOrderAlarm();
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
  envelope.connect(getMaster(ctx));
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

/* ------------------------------------------------------------------- alarm */

/**
 * The order alarm. This is deliberately the loudest thing the console can make:
 * a square-wave siren at full gain, doubled an octave up for extra bite, so it
 * cuts through a busy kitchen instead of blending into it. A two-tone "wee-woo"
 * also reads as "someone must act" rather than as a notification.
 *
 * The kitchen asked for it *loud* and for it to keep going until somebody takes
 * an action, so this is intentionally aggressive: the blast holds, and the pair
 * repeats fast enough to be impossible to ignore.
 */
function sirenStrike(ctx: AudioContext, frequency: number, at: number, gain: number): void {
  const bus = getMaster(ctx);

  // Fundamental: a hard square wave, the harshest waveform there is.
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  // Fast attack, hold, short tail so successive blasts stay distinct rather
  // than smearing into a drone.
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  envelope.gain.setValueAtTime(gain, at + 0.26);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
  oscillator.connect(envelope);
  envelope.connect(bus);
  oscillator.start(at);
  oscillator.stop(at + 0.36);

  // An octave partial at lower gain adds brightness and edge — it is what makes
  // the siren read as an *alarm* rather than a musical note.
  const overtone = ctx.createOscillator();
  const overtoneEnvelope = ctx.createGain();
  overtone.type = "square";
  overtone.frequency.value = frequency * 2;
  overtoneEnvelope.gain.setValueAtTime(0.0001, at);
  overtoneEnvelope.gain.exponentialRampToValueAtTime(gain * 0.45, at + 0.012);
  overtoneEnvelope.gain.setValueAtTime(gain * 0.45, at + 0.2);
  overtoneEnvelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
  overtone.connect(overtoneEnvelope);
  overtoneEnvelope.connect(bus);
  overtone.start(at);
  overtone.stop(at + 0.36);
}

/** One full "wee-woo" pair, both tones pushed to full gain. */
function playSirenBurst(ctx: AudioContext, at: number): void {
  sirenStrike(ctx, 988.0, at, 0.9);
  sirenStrike(ctx, 1319.0, at + 0.18, 0.9);
}

// How often a burst repeats while an order is unacknowledged. Every 0.7 s is
// urgent — a rapid "wee-woo wee-woo" that cannot be mistaken for background.
const ALARM_PERIOD_MS = 700;
// Reschedule a little before the queued bursts run out so the loop never gaps.
const ALARM_LOOKAHEAD_MS = 250;
const ALARM_BURSTS_PER_TICK = 4;

let alarmTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAlarmTick(): void {
  const ctx = context;
  if (!ctx) return;
  const now = ctx.currentTime;
  for (let i = 0; i < ALARM_BURSTS_PER_TICK; i += 1) {
    playSirenBurst(ctx, now + i * (ALARM_PERIOD_MS / 1000));
  }
  alarmTimer = setTimeout(
    scheduleAlarmTick,
    ALARM_BURSTS_PER_TICK * ALARM_PERIOD_MS - ALARM_LOOKAHEAD_MS,
  );
}

/**
 * Start the repeating order siren. Safe to call repeatedly (a second call while
 * it is already running is a no-op), and it respects the sound preference — a
 * kitchen that muted the console stays muted.
 */
export function startOrderAlarm(): void {
  if (!enabled) return;
  if (typeof window === "undefined") return;
  const ctx = getContext();
  if (!ctx) return;

  const begin = () => {
    if (alarmTimer !== null) return;
    scheduleAlarmTick();
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(begin).catch(() => undefined);
  } else {
    begin();
  }
}

/** Stop the order siren. Called the moment an operator takes an action. */
export function stopOrderAlarm(): void {
  if (alarmTimer !== null) {
    clearTimeout(alarmTimer);
    alarmTimer = null;
  }
}

export function isOrderAlarmRunning(): boolean {
  return alarmTimer !== null;
}

/**
 * Resume the AudioContext from a real user gesture. Autoplay policy means a
 * page cannot make sound until the visitor has interacted; without this, an
 * alarm triggered by a background poll would be silently dropped. The admin
 * watcher calls this on the first pointer/key interaction.
 */
export function unlockAudio(): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}
