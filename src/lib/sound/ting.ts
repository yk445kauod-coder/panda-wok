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
// A single master bus every tone runs through. A limiter on the bus stops the
// alarm's peaks from clipping into a crackle; the polite `ting` shares the bus
// at its own (much lower) gain, so the limiter only ever engages on the alarm.
let master: GainNode | null = null;
// The alarm rides its own bus, boosted well above unity, feeding the master.
// Keeping the boost on a dedicated node (rather than raising the master) is what
// lets the siren be *much* louder without also making the confirmation `ting`
// shout. The limiter downstream keeps the boosted peaks from clipping.
let alarmBus: GainNode | null = null;

// How hard the order siren is pushed. The kitchen asked for it loud above all
// else, so this is deliberately hot; the limiter absorbs the peaks.
const ALARM_GAIN = 3;

function getMaster(ctx: AudioContext): GainNode {
  if (master) return master;
  const gain = ctx.createGain();
  gain.gain.value = 1;

  const limiter = ctx.createDynamicsCompressor();
  // A safety net, not a compressor: it only bites at the very peaks (where the
  // fundamental and its octaves overlap) so the siren stays as loud as the
  // browser allows without clipping into a crackle. The quiet confirmation ting
  // is far below this threshold and passes through untouched.
  limiter.threshold.value = -0.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  gain.connect(limiter);
  limiter.connect(ctx.destination);
  master = gain;
  return master;
}

/** The alarm's boosted path into the shared master/limiter. */
function getAlarmBus(ctx: AudioContext): GainNode {
  if (alarmBus) return alarmBus;
  const gain = ctx.createGain();
  gain.gain.value = ALARM_GAIN;
  gain.connect(getMaster(ctx));
  alarmBus = gain;
  return gain;
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
  if (!context) {
    preferPlaybackSession();
    context = new Ctor();
  }
  return context;
}

/**
 * Resume the context if the browser has paused it, then run `then`.
 *
 * The check is deliberately `!== "running"` rather than `=== "suspended"`.
 * Safari adds a third, non-standard state, `"interrupted"`: the context takes it
 * when a phone call, Siri, the lock screen or a background/foreground cycle
 * steals the audio session. It is neither `"running"` nor `"suspended"`, so a
 * `suspended`-only check skipped the `resume()` and left the siren silent for
 * good — on exactly the device the kitchen uses. Treating any non-running state
 * as resumable covers `interrupted` too.
 */
function ensureRunning(ctx: AudioContext, then: () => void): void {
  if (ctx.state === "running") {
    then();
    return;
  }
  void ctx.resume().then(then).catch(() => undefined);
}

/**
 * Ask Safari to treat the console's audio as "playback" content.
 *
 * The Audio Session API (Safari 16.4+) is the only way to stop the hardware
 * mute switch from silencing WebAudio: with the default session an iPhone on
 * silent plays nothing, so an operator would never hear the order siren. This is
 * best-effort — an unsupported or read-only session simply leaves the default,
 * and the siren still works whenever the switch is off.
 */
function preferPlaybackSession(): void {
  if (typeof navigator === "undefined") return;
  try {
    const session = (navigator as unknown as { audioSession?: { type?: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch {
    // Unsupported or read-only; nothing to do.
  }
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
  ensureRunning(ctx, start);
}

/** A single lower tone for a rejection or a failed action. */
export function playBuzz(): void {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;
  const start = () => strike(ctx, 196.0, ctx.currentTime, 0.12);
  ensureRunning(ctx, start);
}

/* ------------------------------------------------------------------- alarm */

/**
 * The order alarm. This is deliberately the loudest thing the console can make:
 * a hard square-wave siren run through a bus boosted past unity gain (see
 * `ALARM_GAIN`), with octave and two-octave layers on top for bite, so it cuts
 * through a busy kitchen instead of blending into it. A two-tone "wee-woo" also
 * reads as "someone must act" rather than as a notification.
 *
 * The kitchen asked for it *loud* and for it to keep going until somebody takes
 * an action, so this is intentionally aggressive: the blast holds, and the pair
 * repeats fast enough to be impossible to ignore.
 */
function sirenStrike(ctx: AudioContext, frequency: number, at: number, gain: number): void {
  const bus = getAlarmBus(ctx);

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
  overtoneEnvelope.gain.exponentialRampToValueAtTime(gain * 0.5, at + 0.012);
  overtoneEnvelope.gain.setValueAtTime(gain * 0.5, at + 0.2);
  overtoneEnvelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
  overtone.connect(overtoneEnvelope);
  overtoneEnvelope.connect(bus);
  overtone.start(at);
  overtone.stop(at + 0.36);

  // A second partial two octaves up, at a low gain. Square waves are already
  // harmonic-rich, but this upper layer is what pushes the siren from "loud
  // beep" to "carries across the whole kitchen" — high frequencies cut through
  // the mid-range noise of exhausts, extractors and a crowd.
  const edge = ctx.createOscillator();
  const edgeEnvelope = ctx.createGain();
  edge.type = "square";
  edge.frequency.value = frequency * 4;
  edgeEnvelope.gain.setValueAtTime(0.0001, at);
  edgeEnvelope.gain.exponentialRampToValueAtTime(gain * 0.22, at + 0.012);
  edgeEnvelope.gain.setValueAtTime(gain * 0.22, at + 0.18);
  edgeEnvelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  edge.connect(edgeEnvelope);
  edgeEnvelope.connect(bus);
  edge.start(at);
  edge.stop(at + 0.36);
}

/** One full "wee-woo" pair, both tones pushed to full gain. */
function playSirenBurst(ctx: AudioContext, at: number): void {
  sirenStrike(ctx, 988.0, at, 1);
  sirenStrike(ctx, 1319.0, at + 0.18, 1);
}

// How often a burst repeats while an order is unacknowledged. Every 0.7 s is
// urgent — a rapid "wee-woo wee-woo" that cannot be mistaken for background.
const ALARM_PERIOD_MS = 700;
// Reschedule a little before the queued bursts run out so the loop never gaps.
const ALARM_LOOKAHEAD_MS = 250;
const ALARM_BURSTS_PER_TICK = 4;

let alarmTimer: ReturnType<typeof setTimeout> | null = null;
// An order arrived while the context was still locked by the autoplay policy.
// The alarm stays wanted — not running — until a gesture unlocks the audio, at
// which point `unlockAudio()` starts it. Without this the siren was lost for
// good: `resume()` is refused before the first gesture, and nothing re-armed it.
let alarmWanted = false;

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

/** Start the siren if the audio is unlocked; otherwise remember that it is due. */
function beginAlarm(ctx: AudioContext): void {
  alarmWanted = true;
  if (ctx.state !== "running") return;
  if (alarmTimer !== null) return;
  scheduleAlarmTick();
}

/**
 * Start the repeating order siren. Safe to call repeatedly (a second call while
 * it is already running is a no-op), and it respects the sound preference — a
 * kitchen that muted the console stays muted.
 *
 * If the browser has not yet granted audio (no gesture since load), the alarm is
 * armed and starts the moment `unlockAudio()` succeeds, rather than being
 * silently dropped.
 */
export function startOrderAlarm(): void {
  if (!enabled) return;
  if (typeof window === "undefined") return;
  const ctx = getContext();
  if (!ctx) return;

  beginAlarm(ctx);
  // The gesture may already have happened and simply not been observed yet; if
  // it has not, `unlockAudio()` will finish the job. `ensureRunning` also
  // recovers Safari's `interrupted` state.
  ensureRunning(ctx, () => beginAlarm(ctx));
}

/** Stop the order siren. Called the moment an operator takes an action. */
export function stopOrderAlarm(): void {
  alarmWanted = false;
  if (alarmTimer !== null) {
    clearTimeout(alarmTimer);
    alarmTimer = null;
  }
}

export function isOrderAlarmRunning(): boolean {
  return alarmTimer !== null;
}

/** True once the AudioContext exists and is actually running (audio is unlocked). */
export function isAudioUnlocked(): boolean {
  return context !== null && context.state === "running";
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
  // Re-assert on every gesture: Safari can reset the session type when the page
  // is backgrounded and restored.
  preferPlaybackSession();
  const finish = () => {
    // A gesture is the browser's permission to make sound. If an order arrived
    // while the context was still locked, this is the moment its siren can run.
    if (alarmWanted && alarmTimer === null) scheduleAlarmTick();
  };
  ensureRunning(ctx, finish);
}
