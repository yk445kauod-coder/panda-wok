"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { cn } from "@/lib/utils/format";
import type { AppNotification } from "@/lib/services/notifications";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/notifications";

/**
 * The bell that both apps share. Presentational plus two tiny mutations:
 * opening marks nothing read (a glance should not clear a badge) and clicking a
 * row marks that row read before navigating.
 *
 * The list arrives from the server as `initial`, so there is no loading flash;
 * after a mutation the component calls `router.refresh()` to re-pull the badge
 * from the database rather than guessing the new count on the client.
 */
export function NotificationBell({
  audience,
  initial,
  initialUnread,
  labels,
  tone = "light",
}: {
  audience: "customer" | "staff";
  initial: AppNotification[];
  initialUnread: number;
  labels: {
    title: string;
    empty: string;
    markAll: string;
    open: string;
  };
  /** `dark` is used on the admin shell's ink sidebar. */
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  // Re-sync when the server sends a new list (after `router.refresh()`), using
  // the render-time "previous value" pattern rather than an effect, which the
  // lint rules correctly reject as a cascading-render risk.
  const [serverSync, setServerSync] = useState({ initial, initialUnread });
  if (serverSync.initial !== initial || serverSync.initialUnread !== initialUnread) {
    setServerSync({ initial, initialUnread });
    setItems(initial);
    setUnread(initialUnread);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openItem(item: AppNotification) {
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? { ...entry, readAt: entry.readAt ?? new Date().toISOString() }
          : entry,
      ),
    );
    if (!item.readAt) setUnread((n) => Math.max(0, n - 1));
    setOpen(false);
    startTransition(async () => {
      await markNotificationReadAction(item.id);
      router.refresh();
    });
  }

  function clearAll() {
    setItems((current) =>
      current.map((entry) => ({
        ...entry,
        readAt: entry.readAt ?? new Date().toISOString(),
      })),
    );
    setUnread(0);
    startTransition(async () => {
      await markAllNotificationsReadAction(audience);
      router.refresh();
    });
  }

  const isDark = tone === "dark";

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={labels.title}
        className={cn(
          "relative grid size-10 place-items-center rounded-lg border transition-colors",
          isDark
            ? "border-rice-100/20 text-rice-100 hover:bg-rice-100/10"
            : "border-ink-900/12 text-ink-800 hover:bg-ink-900/5",
        )}
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-vermilion-600 px-1 text-[10px] font-semibold text-rice-50">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={labels.title}
          className="absolute end-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-900/10 bg-rice-50 shadow-washi"
        >
          <div className="flex items-center justify-between border-b border-ink-900/8 px-3 py-2">
            <span className="text-sm font-semibold text-ink-900">{labels.title}</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-miso-700 hover:text-miso-800"
              >
                <Check className="size-3.5" aria-hidden="true" />
                {labels.markAll}
              </button>
            ) : null}
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-700/60">
                {labels.empty}
              </li>
            ) : (
              items.map((item) => {
                const body = (
                  <>
                    <span className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "text-sm leading-snug",
                          item.readAt ? "text-ink-800" : "font-semibold text-ink-900",
                        )}
                      >
                        {item.title}
                      </span>
                      {!item.readAt ? (
                        <span
                          className="mt-1 size-2 shrink-0 rounded-full bg-vermilion-600"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                    {item.body ? (
                      <span className="mt-0.5 block text-xs leading-snug text-ink-700/75">
                        {item.body}
                      </span>
                    ) : null}
                  </>
                );

                return (
                  <li key={item.id} className="border-b border-ink-900/6 last:border-0">
                    {item.link ? (
                      <Link
                        href={item.link}
                        onClick={() => openItem(item)}
                        className="block px-3 py-2.5 transition-colors hover:bg-rice-100"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className="block w-full px-3 py-2.5 text-start transition-colors hover:bg-rice-100"
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
