"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BadgePercent,
  BookOpen,
  Bot,
  Boxes,
  Brain,
  Clock3,
  Coffee,
  Database,
  Download,
  ExternalLink,
  Gauge,
  Heart,
  LayoutDashboard,
  type LucideIcon,
  Menu,
  MessagesSquare,
  Package,
  Radio,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  Tags,
  Users,
  X,
} from "lucide-react";
import { ADMIN_NAV, type Capability, type StaffRole } from "@/lib/auth/rbac";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AdminBottomNav } from "@/components/admin/admin-bottom-nav";
import { OrderAlertWatcher } from "@/components/admin/order-alert-watcher";
import type { AppNotification } from "@/lib/services/notifications";
import type { OrderAlert } from "@/lib/services/admin-orders";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils/format";

/**
 * Nav destinations to icons. Kept here rather than in rbac.ts because that
 * module is imported by server code and must stay free of React.
 */
const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/orders": ShoppingBag,
  "/admin/kitchen": Coffee,
  "/admin/stock": Boxes,
  "/admin/menu": Package,
  "/admin/categories": Tags,
  "/admin/upsell": Sparkles,
  "/admin/offers": BadgePercent,
  "/admin/crm": Users,
  "/admin/crm/activity": Activity,
  "/admin/crm/segments": Gauge,
  "/admin/crm/insights": Brain,
  "/admin/loyalty": Heart,
  "/admin/feedback": MessagesSquare,
  "/admin/chat": Send,
  "/admin/broadcast": Radio,
  "/admin/analytics": Clock3,
  "/admin/ai": Bot,
  "/admin/ai/usage": Database,
  "/admin/agent": Sparkles,
  "/admin/team-chat": MessagesSquare,
  "/admin/users": Users,
  "/admin/exports": Download,
  "/admin/backups": Database,
  "/admin/settings": Settings,
  "/admin/guide": BookOpen,
};

const GROUP_ORDER = ["Operations", "CRM", "Growth", "Platform", "Help"];

/** Map a nav group's English name to its dictionary key. */
function groupKeyOf(group: string): string {
  const item = ADMIN_NAV.find((entry) => entry.group === group);
  return item?.groupKey ?? "operations";
}

/**
 * Admin navigation. The link list is filtered by the caller's capabilities, so
 * a role never sees a destination the server would bounce them away from.
 */
export function AdminShell({
  role,
  capabilities,
  staffName,
  brand,
  notifications = [],
  unreadCount = 0,
  pendingOrders = [],
  children,
}: {
  role: StaffRole;
  capabilities: readonly Capability[];
  staffName: string;
  brand?: { name: string; logo_url: string | null };
  notifications?: AppNotification[];
  unreadCount?: number;
  pendingOrders?: OrderAlert[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const { locale, t, dir } = useI18n();

  // A destination with no capability is shown to every unlocked member (the
  // guide); otherwise the role must actually hold the capability.
  const allowed = ADMIN_NAV.filter(
    (item) => !item.capability || capabilities.includes(item.capability),
  );
  const groups = GROUP_ORDER.filter((group) =>
    allowed.some((item) => item.group === group),
  );

  // The mobile drawer leaves focus behind an overlay unless it is unwound:
  // Escape closes it, background scroll is locked, and focus moves into the
  // panel. Route changes close it from each link's own handler, so there is no
  // effect watching the pathname.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = navRef.current?.querySelector<HTMLElement>("a, button");
    first?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div
      dir={dir}
      className="admin-scope flex min-h-dvh flex-col bg-rice-100 lg:flex-row"
    >
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-ink-900/10 bg-ink-950/95 px-3 pt-safe text-rice-100 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="admin-nav"
          aria-label={t("admin.shell.openNav")}
          className="grid size-10 place-items-center rounded-lg border border-rice-100/20 text-rice-100"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <Link href="/admin" className="flex min-w-0 items-center gap-2">
          <BrandLogo
            brand={brand ?? { name: "Panda Wok", logo_url: null }}
            className="size-7"
          />
          <span className="truncate font-display text-base font-semibold text-rice-50">
            Ops
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          <NotificationBell
            audience="staff"
            tone="dark"
            initial={notifications}
            initialUnread={unreadCount}
            labels={{
              title: "Notifications",
              empty: "You are all caught up.",
              markAll: "Clear",
              open: "Open notifications",
            }}
          />
        </div>
      </div>

      {/* Drawer backdrop (mobile only) */}
      {open ? (
        <button
          type="button"
          aria-label={t("admin.shell.closeNav")}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <nav
        id="admin-nav"
        ref={navRef}
        aria-label={t("admin.shell.sectionLabel")}
        className={cn(
          "shrink-0 bg-ink-950 text-rice-100 lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-64 lg:overflow-y-auto",
          // Below lg it is an off-canvas drawer: a full-height panel that slides
          // in over the page instead of pushing content down the screen.
          "max-lg:fixed max-lg:inset-y-0 max-lg:start-0 max-lg:z-50 max-lg:w-72 max-lg:overflow-y-auto max-lg:pb-20 max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200",
          open ? "max-lg:translate-x-0" : "max-lg:-translate-x-full rtl:max-lg:translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-5 lg:hidden">
          <div className="flex items-center gap-2.5">
            <BrandLogo
              brand={brand ?? { name: "Panda Wok", logo_url: null }}
              className="size-8 rounded-lg bg-rice-50/10 p-1"
            />
            <span className="font-display text-sm font-semibold text-rice-50">
              {t("admin.shell.opsName")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="grid size-9 place-items-center rounded-lg border border-rice-100/20 text-rice-100"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="hidden items-center gap-2.5 px-4 pt-5 lg:flex">
          <BrandLogo
            brand={brand ?? { name: "Panda Wok", logo_url: null }}
            className="size-9 rounded-lg bg-rice-50/10 p-1"
          />
          <span className="min-w-0">
            <span className="block font-display text-sm font-semibold text-rice-50">
              {t("admin.shell.opsName")}
            </span>
            <span className="block truncate text-2xs text-rice-300/70">
              {staffName}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <LanguageSwitcher current={locale} variant="compact" />
          <div className="hidden lg:block">
            <NotificationBell
              audience="staff"
              tone="dark"
              initial={notifications}
              initialUnread={unreadCount}
              labels={{
                title: t("admin.shell.notifications"),
                empty: t("admin.shell.notificationsEmpty"),
                markAll: t("admin.shell.clear"),
                open: t("admin.shell.openNotifications"),
              }}
            />
          </div>
        </div>

        <div className="px-4 pt-3 lg:pb-1">
          <span className="inline-flex items-center rounded-full bg-rice-100/10 px-2 py-0.5 text-3xs font-semibold tracking-wide text-rice-200 uppercase">
            {t(`admin.role.${role}`)}
          </span>
        </div>

        <div className="space-y-5 px-3 py-4">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2.5 text-3xs font-semibold tracking-wider text-rice-300/55 uppercase">
                {t(`admin.group.${groupKeyOf(group)}`)}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {allowed
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const active =
                      item.href === "/admin"
                        ? pathname === "/admin"
                        : pathname.startsWith(item.href);
                    const Icon = ICONS[item.href] ?? LayoutDashboard;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                            active
                              ? "bg-vermilion-600 font-medium text-rice-50"
                              : "text-rice-200/85 hover:bg-rice-100/8 hover:text-rice-50",
                          )}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">{t(`admin.nav.${item.labelKey}`)}</span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-rice-100/10 px-3 py-4">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2.5 py-2 text-sm text-rice-200/75 hover:bg-rice-100/8 hover:text-rice-50"
          >
            {t("admin.shell.viewSite")}
          </Link>
        </div>
      </nav>

      <main id="main" className="min-w-0 flex-1">
        <OrderAlertWatcher initialPending={pendingOrders} />
        <div className="hidden items-center justify-between gap-3 border-b border-ink-900/10 bg-rice-100/60 px-6 py-2.5 lg:flex">
          <div className="flex items-center gap-2 text-xs text-ink-700/75">
            <span className="inline-flex h-6 items-center rounded-full bg-vermilion-600/10 px-2.5 font-semibold tracking-wide text-vermilion-700 uppercase">
              {t(`admin.role.${role}`)}
            </span>
            <span className="truncate">{staffName}</span>
          </div>
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-900/6 hover:text-ink-900"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {t("admin.shell.viewSite")}
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-3 py-4 pb-24 sm:px-4 sm:py-5 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </div>
      </main>

      <AdminBottomNav
        capabilities={capabilities}
        unreadCount={unreadCount}
        onMore={() => setOpen(true)}
      />
    </div>
  );
}
