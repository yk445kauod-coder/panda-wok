"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { AppNotification } from "@/lib/services/notifications";

type Viewer = {
  ready: boolean;
  signedIn: boolean;
  notifications: AppNotification[];
  unread: number;
};

const ViewerContext = createContext<Viewer>({
  ready: false,
  signedIn: false,
  notifications: [],
  unread: 0,
});

/**
 * Who is looking at the page, resolved on the client.
 *
 * The customer shell is prerendered per locale, so it cannot know at build time
 * whether the visitor is signed in. This asks the server once after mount and
 * shares the answer with everything that cares — the notification bell, the
 * mobile nav's account links — instead of each part making its own round trip.
 *
 * The read is a plain `GET /api/public/me/notifications`, not a Server Action.
 * An action is a POST back to the *page* it was declared on, and every customer
 * page is a static shell, so that POST forced the App Router to re-emit a static
 * document on every page load — one of the request shapes that exceeds the Free
 * plan's 10 ms CPU cap (Error 1102). A GET route is one cheap invocation.
 */
export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<Viewer>({
    ready: false,
    signedIn: false,
    notifications: [],
    unread: 0,
  });

  useEffect(() => {
    let active = true;
    fetch("/api/public/me/notifications", {
      cache: "no-store",
      headers: { accept: "application/json" },
    })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              ok: boolean;
              data?: { signedIn: boolean; notifications: AppNotification[]; unread: number };
            })
          : null,
      )
      .then((payload) => {
        if (!active) return;
        if (payload?.ok && payload.data) {
          setViewer({ ready: true, ...payload.data });
          return;
        }
        setViewer({ ready: true, signedIn: false, notifications: [], unread: 0 });
      })
      .catch(() => {
        if (active) setViewer({ ready: true, signedIn: false, notifications: [], unread: 0 });
      });
    return () => {
      active = false;
    };
  }, []);

  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}
