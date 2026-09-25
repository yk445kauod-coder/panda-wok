"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { createSoundEngine, type SoundEngine, type SoundName } from "@/lib/sound/engine";

const STORAGE_KEY = "panda-wok.sound";

/*
 * The preference lives in a tiny external store rather than component state.
 * `useSyncExternalStore` is the React-sanctioned way to read a browser-only
 * value: the server snapshot is always `false`, so the first paint is "off"
 * on both sides and hydration cannot mismatch, while the client immediately
 * re-reads the real stored value.
 */
let enabled = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeStored(next: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    // A blocked localStorage must not stop the toggle from working.
  }
}

type SoundContextValue = {
  /** True once the customer has opted in on this device. */
  enabled: boolean;
  /** Flips the preference, persists it and gives immediate feedback. */
  toggle: () => void;
  /** Plays a cue, but only when sound is enabled. Safe to call anywhere. */
  play: (name: SoundName) => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);

/**
 * Sound preference and the one shared engine.
 *
 * The default is **off**. Sound is opt-in per device because it is the polite
 * choice: a customer on a bus or in an office did not ask this site to make
 * noise. The preference lives in localStorage, and the engine is only built once
 * the customer turns it on, so no AudioContext exists for anyone who ignores it.
 */
export function SoundProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<SoundEngine | null>(null);
  const on = useSyncExternalStore(
    subscribe,
    () => enabled,
    () => false,
  );

  // Adopt the stored preference after mount, and only then build the engine.
  // Deliberately in an effect: touching localStorage during render would differ
  // between server and client and break hydration.
  useEffect(() => {
    if (!readStored()) return;
    enabled = true;
    engineRef.current ??= createSoundEngine();
    engineRef.current.setEnabled(true);
    emit();
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      enabled = false;
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    engineRef.current ??= createSoundEngine();
    engineRef.current.setEnabled(next);
    writeStored(next);
    enabled = next;
    // Confirm the change audibly, but only when turning it on — a click on the
    // way out should be silent.
    if (next) engineRef.current.play("success");
    emit();
  }, []);

  const play = useCallback((name: SoundName) => {
    engineRef.current?.play(name);
  }, []);

  const value = useMemo(() => ({ enabled: on, toggle, play }), [on, toggle, play]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

/**
 * The sound context. Returns a no-op player when there is no provider so a
 * component can call `play` without knowing whether sound is mounted.
 */
export function useSound(): SoundContextValue {
  const context = useContext(SoundContext);
  return (
    context ?? {
      enabled: false,
      toggle: () => {},
      play: () => {},
    }
  );
}
