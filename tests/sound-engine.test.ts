import { describe, expect, it, vi } from "vitest";
import { createSoundEngine } from "@/lib/sound/engine";

/**
 * The engine's contract is that it is silent until asked. These tests assert the
 * gate rather than the audio: no AudioContext is constructed for a customer who
 * never opts in, and a cue played while disabled never reaches the audio graph.
 */

function fakeAudioContext() {
  const started: number[] = [];
  const close = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    state: "running",
    currentTime: 0,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close,
    createOscillator: () => ({
      type: "sine",
      frequency: { value: 0 },
      connect: (node: unknown) => node,
      start: (at: number) => started.push(at),
      stop: () => {},
    }),
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: (node: unknown) => node,
    }),
    createBiquadFilter: () => ({
      type: "lowpass",
      frequency: { value: 0 },
      connect: (node: unknown) => node,
    }),
  };
  return { ctx, started, close };
}

function installAudio() {
  const fake = fakeAudioContext();
  const Ctor = vi.fn(() => fake.ctx);
  vi.stubGlobal("window", { AudioContext: Ctor });
  return { fake, Ctor };
}

describe("sound engine", () => {
  it("does not build an AudioContext until it is enabled", () => {
    const { Ctor } = installAudio();
    const engine = createSoundEngine();

    engine.play("tap");

    expect(Ctor).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("stays silent when a cue is played while disabled", () => {
    const { fake, Ctor } = installAudio();
    const engine = createSoundEngine();

    engine.play("success");

    expect(Ctor).not.toHaveBeenCalled();
    expect(fake.started).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("renders the cue's notes once enabled", () => {
    const { fake, Ctor } = installAudio();
    const engine = createSoundEngine();

    engine.setEnabled(true);
    engine.play("add");

    expect(Ctor).toHaveBeenCalledTimes(1);
    // "add" is two notes, each with three partials.
    expect(fake.started).toHaveLength(6);
    vi.unstubAllGlobals();
  });

  it("reuses a single AudioContext across cues", () => {
    const { Ctor } = installAudio();
    const engine = createSoundEngine();

    engine.setEnabled(true);
    engine.play("tap");
    engine.play("tap");

    expect(Ctor).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("closes the context and goes silent on dispose", () => {
    const { fake, Ctor } = installAudio();
    const engine = createSoundEngine();

    engine.setEnabled(true);
    engine.play("tap");
    engine.dispose();
    engine.play("tap");

    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(Ctor).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
