"use client";

import { useT } from "@/components/i18n-provider";
import { useViewer } from "@/components/layout/viewer-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";

/**
 * The header bell, rendered only once the viewer is known to be signed in.
 *
 * The shell is prerendered, so the answer to "is anyone signed in?" arrives
 * from `ViewerProvider` after mount rather than during the render.
 */
export function HeaderNotifications() {
  const t = useT();
  const viewer = useViewer();

  if (!viewer.signedIn) return null;

  return (
    <NotificationBell
      audience="customer"
      initial={viewer.notifications}
      initialUnread={viewer.unread}
      labels={{
        title: t("nav.notifications"),
        empty: t("nav.notificationsEmpty"),
        markAll: t("nav.notificationsClearAll"),
        open: t("nav.notificationsOpen"),
      }}
    />
  );
}
