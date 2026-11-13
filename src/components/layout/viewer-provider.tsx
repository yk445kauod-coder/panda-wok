"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { loadMyNotificationsAction } from "@/lib/actions/notifications";
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
    loadMyNotificationsAction()
      .then((next) => {
        if (active) setViewer({ ready: true, ...next });
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
