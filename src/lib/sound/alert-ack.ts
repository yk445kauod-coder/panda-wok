/**
 * Local acknowledgement store for the console order alert.
 *
 * "Acknowledge" is a per-browser dismissal: an operator who has seen the alert
 * but cannot action the order (a rider at the door, a manager on the phone) can
 * silence the siren without touching the order. It lives in localStorage so it
 * survives a refresh, and is a subscribable store so React reads it through
 * `useSyncExternalStore` without a seeding effect (reading localStorage in an
 * effect to seed state trips the set-state-in-effect lint).
 *
 * The store is bounded: only the most recent ids are kept, so a long-running
 * console cannot accumulate an unbounded set.
 */

const STORAGE_KEY = "panda-wok.admin.ack-orders";
const MAX_ACKNOWLEDGED = 200;

const listeners = new Set<() => void>();

let ackIds = readAck();

function readAck(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? raw.split(",").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Stable snapshot for `useSyncExternalStore`; a primitive avoids re-renders. */
export function ackSnapshot(): string {
  return ackIds.join(",");
}

/** SSR snapshot: nothing is acknowledged before the browser has run. */
export function ackServerSnapshot(): string {
  return "";
}

export function subscribeAck(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mark one or more order ids as acknowledged (silences their siren). */
export function acknowledgeAll(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const next = [...new Set([...ids, ...ackIds])].slice(0, MAX_ACKNOWLEDGED);
  ackIds = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next.join(","));
    } catch {
      // Private mode: the acknowledgement just does not persist across a reload.
    }
  }
  listeners.forEach((listener) => listener());
}
