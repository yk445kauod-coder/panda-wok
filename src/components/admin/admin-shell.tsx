"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
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
import { ADMIN_NAV, ROLE_LABELS, type Capability, type StaffRole } from "@/lib/auth/rbac";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
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
  "/admin/users": Users,
  "/admin/exports": Download,
  "/admin/backups": Database,
  "/admin/settings": Settings,
  "/admin/guide": BookOpen,
};

const GROUP_ORDER = ["Operations", "CRM", "Growth", "Platform", "Help"];

/**
 * Admin navigation. The link list is filtered by the caller's capabilities, so
 * a role never sees a destination the server would bounce them away from.
 */
export function AdminShell({
  role,
  capabilities,
  staffName,
  brand,
  children,
}: {
  role: StaffRole;
  capabilities: readonly Capability[];
  staffName: string;
  brand?: { name: string; logo_url: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { locale } = useI18n();

  // A destination with no capability is shown to every unlocked member (the
  // guide); otherwise the role must actually hold the capability.
  const allowed = ADMIN_NAV.filter(
    (item) => !item.capability || capabilities.includes(item.capability),
  );
  const groups = GROUP_ORDER.filter((group) =>
    allowed.some((item) => item.group === group),
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-ink-900/10 bg-ink-950/92 px-4 pt-safe text-rice-100 backdrop-blur lg:hidden">
        <Link href="/admin" className="flex h-14 items-center gap-2">
          <BrandLogo
            brand={brand ?? { name: "Panda Wok", logo_url: null }}
            className="size-8"
          />
          <span className="font-display text-base font-semibold text-rice-50">
            Ops
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher current={locale} variant="compact" />
          <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="admin-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="grid size-10 place-items-center rounded-lg border border-rice-100/20 text-rice-100"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        </div>
      </div>

      <nav
        id="admin-nav"
        aria-label="Admin sections"
        className={cn(
          "shrink-0 bg-ink-950 text-rice-100 lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-64 lg:overflow-y-auto",
          open ? "block border-b border-ink-900/10" : "hidden",
        )}
      >
        <div className="hidden items-center gap-2.5 px-4 pt-5 lg:flex">
          <BrandLogo
            brand={brand ?? { name: "Panda Wok", logo_url: null }}
            className="size-9 rounded-lg bg-rice-50/10 p-1"
          />
          <span className="min-w-0">
            <span className="block font-display text-sm font-semibold text-rice-50">
              Panda Wok Ops
            </span>
            <span className="block truncate text-2xs text-rice-300/70">
              {staffName}
            </span>
          </span>
        </div>

        <div className="hidden px-4 pt-3 lg:block">
          <LanguageSwitcher current={locale} variant="compact" />
        </div>

        <div className="px-4 pt-3 lg:pb-1">
          <span className="inline-flex items-center rounded-full bg-rice-100/10 px-2 py-0.5 text-3xs font-semibold tracking-wide text-rice-200 uppercase">
            {ROLE_LABELS[role]}
          </span>
        </div>

        <div className="space-y-5 px-3 py-4">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2.5 text-3xs font-semibold tracking-wider text-rice-300/55 uppercase">
                {group}
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
                          <span className="truncate">{item.label}</span>
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
            className="block rounded-lg px-2.5 py-2 text-sm text-rice-200/75 hover:bg-rice-100/8 hover:text-rice-50"
          >
            View the customer site
          </Link>
        </div>
      </nav>

      <main id="main" className="min-w-0 flex-1">
        <div className="hidden items-center justify-between gap-3 border-b border-ink-900/10 bg-rice-100/60 px-6 py-2.5 lg:flex">
          <div className="flex items-center gap-2 text-xs text-ink-700/75">
            <span className="inline-flex h-6 items-center rounded-full bg-vermilion-600/10 px-2.5 font-semibold tracking-wide text-vermilion-700 uppercase">
              {ROLE_LABELS[role]}
            </span>
            <span className="truncate">{staffName}</span>
          </div>
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-900/6 hover:text-ink-900"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            View the customer site
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-4 py-5 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
