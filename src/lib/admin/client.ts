"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client-side reader for the console's JSON API.
 *
 * Every admin page is now a client component that fetches its own data from
 * `/api/admin/…`, so the Worker only ever serves the static shell. This hook is
 * the one place that fetch lives: it exposes `data` / `loading` / `error` and a
 * `reload()` the pages call after a mutation, replacing the old
 * `router.refresh()` (which would re-render a server component on the Worker).
 *
 * A 401/403 means the unlock cookie is gone, so the page hands control back to
 * the gate by dispatching `panda-wok:locked` — `AdminApp` listens and shows the
 * passcode field, exactly like the old server redirect to /admin/denied.
 */
export type AdminDataState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * `live: true` opts a page into the console's shared live beat.
 *
 * The shell's one timer (and every realtime ping) fires `panda-wok:live`; only
 * the boards whose content actually changes with an order — the orders list,
 * the kitchen board, an open order — re-fetch on it. Without the flag a page
 * still re-reads after a mutation (`panda-wok:refresh`), but a settings or
 * exports screen no longer spends a Worker invocation on every beat just
 * because it happens to be open in the same tab.
 */
export type AdminDataOptions = { live?: boolean };

export function useAdminData<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
  options?: AdminDataOptions,
): AdminDataState<T> {
  const live = options?.live ?? false;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // The query object is rebuilt every render, so depend on its serialised form
  // rather than the object identity to avoid an infinite fetch loop.
  const search = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, String(value));
      }
    }
  }
  const qs = search.toString();
  const url = qs ? `${path}?${qs}` : path;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // A mutation anywhere on the page (a status change, a saved form) broadcasts
  // this event instead of the old `router.refresh()`, which no longer re-runs
  // anything now that the page is static. It is deliberately not the live beat:
  // a saved form must always re-read, whatever the page's `live` flag.
  useEffect(() => {
    window.addEventListener("panda-wok:refresh", reload);
    return () => window.removeEventListener("panda-wok:refresh", reload);
  }, [reload]);

  // The shared live beat, opt-in per page. Fired by the shell's single timer and
  // by every realtime order ping.
  useEffect(() => {
    if (!live) return;
    window.addEventListener("panda-wok:live", reload);
    return () => window.removeEventListener("panda-wok:live", reload);
  }, [live, reload]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          window.dispatchEvent(new Event("panda-wok:locked"));
          return null;
        }
        if (!response.ok) throw new Error(`request failed (${response.status})`);
        return (await response.json()) as { ok: boolean; data?: T };
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        if (!payload.ok) throw new Error("read failed");
        setData(payload.data ?? null);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError(caught instanceof Error ? caught.message : "read failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, nonce]);

  return { data, loading, error, reload };
}

/**
 * Re-fetches `path` on a visible-only interval, for boards that must stay live
 * (kitchen, orders). A hidden tab polls nothing, so a backgrounded console
 * costs no Worker invocations — the same guard the old server pages used.
 */
export function useAdminPoll(reload: () => void, intervalMs: number, enabled = true) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!enabled) return;
    let handle: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (handle !== null) return;
      handle = setInterval(() => reloadRef.current(), intervalMs);
    };
    const stop = () => {
      if (handle !== null) clearInterval(handle);
      handle = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}

/**
 * Tells the console to re-fetch the current page's data after a mutation.
 *
 * Every admin page is now a client component reading its own JSON endpoint, so
 * a server-action success can no longer refresh the tree with `router.refresh()`
 * (there is nothing server-rendered left to refresh). The mutation forms call
 * this instead, and `useAdminData` re-runs its fetch.
 */
export function refreshAdminData() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("panda-wok:refresh"));
  }
}
