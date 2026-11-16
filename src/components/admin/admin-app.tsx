"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { AdminI18n } from "@/components/admin/admin-i18n";
import { AdminGateForm } from "@/components/admin/admin-gate-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminSessionProvider } from "@/components/admin/admin-session";
import { seedOpsPending } from "@/lib/live/ops-sync";
import {
  ADMIN_DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "@/lib/i18n/config";
import type { Capability, StaffRole } from "@/lib/auth/rbac";
import type { AppNotification } from "@/lib/services/notifications";
import type { OrderAlert } from "@/lib/services/admin-orders";

type SessionPayload =
  | { ok: true; unlocked: false; brand?: Brand }
  | {
      ok: true;
      unlocked: true;
      role: StaffRole;
      capabilities: Capability[];
      staffName: string;
      brand: Brand;
      /** The live hub's origin, or null when the deployment has none. */
      opsHubUrl: string | null;
      notifications: AppNotification[];
      unreadCount: number;
      pendingOrders: OrderAlert[];
    };

type Brand = { name: string; logo_url: string | null };

/** Locale for the console: the switcher cookie, else Arabic (staff default). */
function readLocale(): Locale {
  if (typeof document === "undefined") return ADMIN_DEFAULT_LOCALE;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE.replace(/\./g, "\\.")}=([^;]*)`),
  );
  const value = match ? decodeURIComponent(match[1]) : undefined;
  return isLocale(value) ? value : ADMIN_DEFAULT_LOCALE;
}

/**
 * Subscribe to the console locale changing.
 *
 * The switcher writes the cookie and then fires `panda-wok:locale`, so the
 * console follows a language change without a reload. `useSyncExternalStore`
 * re-reads the cookie on that event instead of holding a copy in state.
 */
function subscribeLocale(onChange: () => void): () => void {
  window.addEventListener("panda-wok:locale", onChange);
  return () => window.removeEventListener("panda-wok:locale", onChange);
}

/**
 * The console, as a single-page app.
 *
 * `/admin` is a static shell: the Worker serves the same HTML for every route
 * and does no React render, no Supabase read and no cookie check. This component
 * is what actually runs — it asks `/api/admin/session` once for the chrome, then
 * each page's own endpoint for its data. That keeps the Free-plan CPU budget for
 * a page load down to "serve one static document", instead of a full SSR pass
 * per open tab.
 */
export function AdminApp({ children }: { children: React.ReactNode }) {
  // The cookie is read through a subscribable snapshot rather than seeded in an
  // effect: reading it in an effect to call setState trips the
  // set-state-in-effect lint, and a primitive snapshot makes the external store
  // cheap to compare. SSR has no cookie, so the server snapshot is the default.
  const locale = useSyncExternalStore(subscribeLocale, readLocale, () => ADMIN_DEFAULT_LOCALE);
  const [payload, setPayload] = useState<SessionPayload | null>(null);

  const loadSession = useCallback(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SessionPayload | null) => {
        if (!data?.ok) return;
        // The socket reads this global rather than the React tree, because it is
        // opened from a module-scope store, not a component.
        if (data.unlocked && data.opsHubUrl) {
          (window as unknown as { __PW_OPS_HUB__?: string }).__PW_OPS_HUB__ = data.opsHubUrl;
        }
        // The session carries the same pending queue `/api/admin/alerts` returns.
        // Seeding the shared store here, before the shell mounts, is what keeps a
        // page load to one read of that queue instead of two.
        if (data.unlocked) seedOpsPending(data.pendingOrders);
        setPayload(data);
      })
      .catch(() => {
        setPayload({ ok: true, unlocked: false, brand: { name: "Panda Wok", logo_url: null } });
      });
  }, []);

  useEffect(() => {
    loadSession();
    // A page's data fetch returning 401/403 means the unlock cookie expired or
    // was revoked; re-resolve the session so the gate reappears.
    const onLocked = () => loadSession();
    window.addEventListener("panda-wok:locked", onLocked);
    return () => window.removeEventListener("panda-wok:locked", onLocked);
  }, [loadSession]);

  return (
    <AdminI18n locale={locale}>
      <ToastProvider>
        {payload === null ? (
          <BootSplash />
        ) : payload.unlocked ? (
          <AdminSessionProvider
            value={{
              role: payload.role,
              capabilities: payload.capabilities,
              staffName: payload.staffName,
              brand: payload.brand,
            }}
          >
            <AdminShell
              role={payload.role}
              capabilities={payload.capabilities}
              staffName={payload.staffName}
              brand={payload.brand}
              notifications={payload.notifications}
              unreadCount={payload.unreadCount}
              pendingOrders={payload.pendingOrders}
            >
              {children}
            </AdminShell>
          </AdminSessionProvider>
        ) : (
          <AdminGateForm brand={payload.brand} onUnlocked={loadSession} />
        )}
      </ToastProvider>
    </AdminI18n>
  );
}

/** A quiet, brand-coloured hold while the session resolves (one fast request). */
function BootSplash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950">
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-2 border-rice-100/25 border-t-rice-100"
      />
    </div>
  );
}
