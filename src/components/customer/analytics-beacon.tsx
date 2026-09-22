"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const SESSION_KEY = "panda-wok.session";

function sessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return "anonymous";
  }
}

function deviceClass() {
  if (typeof window === "undefined") return "unknown";
  const width = window.innerWidth;
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/**
 * Records a single PAGE_VIEW per navigation into analytics_events. This is the
 * only always-on client telemetry; it stores no personal data beyond an opaque
 * per-tab session id, and it respects the analytics feature flag.
 */
export function AnalyticsBeacon({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (pathname.startsWith("/admin")) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    const payload = {
      event: "PAGE_VIEW",
      path: pathname,
      session_id: sessionId(),
      device: deviceClass(),
      referrer: document.referrer || null,
      metadata: {},
    };

    // sendBeacon survives the page being closed mid-navigation.
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/analytics",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Analytics must never surface an error to the customer.
    });
  }, [enabled, pathname]);

  return null;
}

/** Client helper for funnel events such as ITEM_VIEW and CHECKOUT_STARTED. */
export function trackEvent(
  event: string,
  metadata: Record<string, unknown> = {},
  path?: string,
) {
  const payload = {
    event,
    path: path ?? (typeof window !== "undefined" ? window.location.pathname : null),
    session_id: sessionId(),
    device: deviceClass(),
    referrer: null,
    metadata,
  };
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Best effort only.
  }
}
