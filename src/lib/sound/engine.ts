/**
 * Interaction sound for the customer site.
 *
 * Synthesised with the Web Audio API — there are no audio files to download, so
 * the site stays fast and nothing plays before the customer asks for it. This is
 * deliberately *not* background music: it is short feedback on a deliberate tap,
 * the way a well-made physical button clicks. Nothing plays on load, nothing
 * loops, and the whole engine is inert until `setEnabled(true)` is called from a
 * real user gesture.
 *
 * The timbre is a soft struck-bar (a sine plus its octave and fifth, with a fast
 * exponential decay) tuned to a pentatonic scale, which is what makes the notes
 * sound like a single instrument rather than unrelated beeps. Every cue is
 * quiet by design: the mix sits well under speech level so it never competes
 * with what the customer is reading.
 */

export type SoundName = "tap" | "add" | "remove" | "success";

/**
 * Pentatonic degrees in Hz (A major pentatonic), so any two cues played back to
 * back are consonant. Ascending cues read as "something was added", descending
 * as "something was taken away".
 */
const CUES: Record<SoundName, { notes: number[]; gain: number; spacing: number }> = {
  tap: { notes: [880], gain: 0.035, spacing: 0 },
  add: { notes: [880, 1318.5], gain: 0.045, spacing: 0.07 },
  remove: { notes: [987.8, 659.3], gain: 0.04, spacing: 0.07 },
  success: { notes: [880, 1108.7, 1318.5], gain: 0.05, spacing: 0.09 },
};

/** One struck bar: fundamental plus two quiet partials, exponential decay. */
function strike(ctx: AudioContext, destination: AudioNode, freq: number, at: number, gain: number) {
  const partials: [number, number][] = [
    [1, 1],
    [2, 0.28],
    [3, 0.12],
  ];

  for (const [ratio, level] of partials) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;

    // A short attack avoids a click; the decay is long enough to read as a
    // struck bar rather than a blip.
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(gain * level, at + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);

    osc.connect(amp).connect(destination);
    osc.start(at);
    osc.stop(at + 0.45);
  }
}

export type SoundEngine = {
  play: (name: SoundName) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

/**
 * Creates the engine. The AudioContext is built lazily on the first enabled
 * `play`/`setEnabled` call so the browser sees it inside a user gesture (which
 * is what allows audio at all) and so a visitor who never turns sound on never
 * pays for an audio context.
 */
export function createSoundEngine(): SoundEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = false;
  let disposed = false;

  const ensure = (): AudioContext | null => {
    if (disposed || typeof window === "undefined") return null;
    if (ctx) {
      // A context can be suspended when the tab is backgrounded; resuming is a
      // no-op otherwise.
      if (ctx.state === "suspended") void ctx.resume();
      return ctx;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 1;
    // One lowpass for the whole instrument: it takes the hard edge off the
    // sine partials so cues feel warm instead of piercing on a phone speaker.
    const shelf = ctx.createBiquadFilter();
    shelf.type = "lowpass";
    shelf.frequency.value = 4200;
    master.connect(shelf).connect(ctx.destination);
    return ctx;
  };

  const play = (name: SoundName) => {
    if (!enabled) return;
    const audio = ensure();
    if (!audio || !master) return;

    const cue = CUES[name];
    const now = audio.currentTime + 0.001;
    cue.notes.forEach((freq, index) => {
      strike(audio, master!, freq, now + index * cue.spacing, cue.gain);
    });
  };

  const setEnabled = (next: boolean) => {
    enabled = next;
    if (next) {
      // Called from the toggle's click handler, so this runs in a gesture.
      ensure();
    }
  };

  return {
    play,
    setEnabled,
    dispose: () => {
      disposed = true;
      enabled = false;
      if (ctx) {
        void ctx.close().catch(() => {});
        ctx = null;
        master = null;
      }
    },
  };
}
