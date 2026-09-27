"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Coffee,
  LayoutDashboard,
  MessagesSquare,
  MoreHorizontal,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ADMIN_MOBILE_NAV, type Capability } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/format";

const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/orders": ShoppingBag,
  "/admin/kitchen": Coffee,
  "/admin/chat": MessagesSquare,
  "/admin/menu": Package,
  "/admin/crm": Users,
};

/**
 * Phone-first bottom navigation for the console. The sidebar is a peer on
 * desktop but on a phone it is hidden behind a hamburger, which puts every
 * destination two taps deep. This keeps the four or five a shift actually
 * rotates through one tap away, with the full list still in the drawer.
 *
 * Only rendered below lg; the desktop layout never mounts it.
 */
export function AdminBottomNav({
  capabilities,
  unreadCount = 0,
  onMore,
}: {
  capabilities: readonly Capability[];
  unreadCount?: number;
  onMore: () => void;
}) {
  const pathname = usePathname();

  const allowed = ADMIN_MOBILE_NAV.filter((item) =>
    capabilities.includes(item.capability),
  );
  // Four tabs plus "More": more than five targets on a phone makes each one
  // too small to hit reliably.
  const primary = allowed.slice(0, 4);

  return (
    <nav
      aria-label="Admin sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rice-100/12 bg-ink-950/97 pb-safe backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {primary.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          const Icon = ICONS[item.href] ?? LayoutDashboard;
          const showBadge = item.href === "/admin/chat" && unreadCount > 0;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-vermilion-300" : "text-rice-100/70 hover:text-rice-50",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  {showBadge ? (
                    <span className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-vermilion-600 px-1 text-[10px] font-bold leading-4 text-rice-50">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : null}
                </span>
                <span className="truncate">{item.label}</span>
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-px h-0.5 w-8 rounded-full bg-vermilion-600"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}

        <li className="flex-1">
          <button
            type="button"
            onClick={onMore}
            className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium text-rice-100/70 transition-colors hover:text-rice-50"
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
