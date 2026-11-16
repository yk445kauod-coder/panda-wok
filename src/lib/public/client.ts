"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client-side reader for the storefront's JSON API.
 *
 * Every customer page is a static shell now, so the Worker no longer renders
 * the catalogue; the browser reads it from `/api/public/…` instead. This is the
 * public twin of `useAdminData`: same `{ data, loading, error, reload }` shape,
 * but no lock event and no live beat — a storefront page is not a live board.
 *
 * A 401 means the visitor is signed out. Account-scoped pages pass `onUnauthorized`
 * to send them to sign-in, which replaces the server page's `redirect()`.
 */
export type PublicDataState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

type Settled<T> = { key: string; data: T | null; error: string | null };

export function usePublicData<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
  options?: { onUnauthorized?: () => void },
): PublicDataState<T> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ key: "", data: null, error: null });

  // The callback is kept in a ref: callers pass an inline arrow (so its identity
  // changes every render), and a request effect that depended on it would
  // re-fetch on every render — an endless loop against the API.
  const onUnauthorized = options?.onUnauthorized;
  const unauthorizedRef = useRef(onUnauthorized);
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized;
  });

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

  // A request is in flight until the state settles under the current key. This
  // is derived rather than stored, so the effect never calls setState
  // synchronously in its body (which triggers cascading renders).
  const requestKey = `${url}\u0000${nonce}`;
  const loading = settled.key !== requestKey;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          unauthorizedRef.current?.();
          return null;
        }
        if (!response.ok) throw new Error(`request failed (${response.status})`);
        return (await response.json()) as { ok: boolean; data?: T };
      })
      .then((payload) => {
        if (cancelled) return;
        if (payload === null) {
          setSettled({ key: requestKey, data: null, error: null });
          return;
        }
        if (!payload.ok) throw new Error("read failed");
        setSettled({ key: requestKey, data: payload.data ?? null, error: null });
      })
      .catch((caught: unknown) => {
        if (cancelled || (caught instanceof DOMException && caught.name === "AbortError")) return;
        // Keep whatever data was already shown; the pages gate on `error && !data`.
        setSettled((prev) => ({
          key: requestKey,
          data: prev.data,
          error: caught instanceof Error ? caught.message : "read failed",
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [requestKey, url]);

  return { data: settled.data, loading, error: settled.error, reload };
}
