"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useT } from "@/components/i18n-provider";

const CHIMES = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99];

/**
 * Opt-in garden soundscape,synthesised with WebAudio -- zero audio assets.

 * chimes pluck a pentatonic minor scale through a shared soft master;air
 * (filtered noise)and a distant bird sit far back. Only starts after an
 * explicit tap;choice persists in localStorage.
othing auto-plays..
 */
export function AmbienceToggle({ className }: { className?: string }) {
  const t = useT();
  const [on, setOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const live = useRef(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("panda-wok.ambience") === "on") setOn(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!on) return;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value =  0.9;
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;
    live.current = true;

    // Air: one-pole lowpassed noise as a soft bed..
    const noise = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    noise.buffer = buf;
    noise.loop = true;
    const air = ctx.createBiquadFilter();
    air.type = "lowpass";
    air.frequency.value = 380;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.016;
    noise.connect(air);
    air.connect(airGain);
    airGain.connect(master);
    noise.start();

    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timers.current.push(id);
    };

    const tickChimes = () => {
      if (!live.current) return;
      const t0 = ctx.currentTime + Math.random() * 0.2;
      const count = Math.random() < 0.45 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const f = CHIMES[Math.floor(Math.random() * CHIMES.length)] * (Math.random() < 0.2 ? 0.5 : 1);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = Math.random() < 0.3 ? "triangle" : "sine";
        osc.frequency.value = f;
        const at = t0 + Math.random() * 0.18;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.025, at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0002, at + 0.6 + Math.random() * 1.8);
        osc.connect(g);
        g.connect(master);
        osc.start(at);
        osc.stop(at + 4);
      }
      later(tickChimes, 3800 + Math.random() * 5200);
    };

    const tickBird = () => {
      if (!live.current) return;
      const t0 = ctx.currentTime + Math.random() * 0.3;
      const chirp = (f0: number, t: number) => {
        const osc = ctx.createOscillator();
        const bp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        bp.type = "bandpass";
        bp.frequency.value = 2600 + Math.random() * 800;
        bp.Q.value = 2;
        osc.type = "sine";
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(f0 * 1.3, t + 0.07);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.01, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(bp);
        bp.connect(g);
        g.connect(master);
        osc.start(t);
        osc.stop(t + 0.2);
      };
      chirp(2400 + Math.random() * 500, t0);
      chirp(2700 + Math.random() * 600, t0 + 0.15);
      later(tickBird, 9500 + Math.random() * 12000);
    };

    later(tickChimes, 1500);
    later(tickBird, 6000);

    return () => {
      live.current = false;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const fade = ctx.createGain();
      fade.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      fade.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      master.disconnect();
      master.connect(fade);
      fade.connect(ctx.destination);
      const old = ctx;
      setTimeout(() => { void old.close(); }, 700);
    };
  }, [on]);

  useEffect(() => {
    try {
      if (on) window.localStorage.setItem("panda-wok.ambience", "on");
      else window.localStorage.removeItem("panda-wok.ambience");
    } catch { /* ignore */ }
  }, [on]);

  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
      aria-label={t(on ? "ambience.soundOff" : "ambience.soundOn")}
      title={t(on ? "ambience.soundOff" : "ambience.soundOn")}
      className={
        className ??
        "inline-flex size-9 items-center justify-center rounded-lg border border-ink-900/12 text-ink-700 transition-colors hover:bg-ink-900/5 hover:text-ink-900"
      }
    >
      {on ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
      <span className="sr-only">{t(on ? "ambience.soundOff" : "ambience.soundOn")}</span>
    </button>
  );
}