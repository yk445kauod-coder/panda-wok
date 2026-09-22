"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ADMIN_NAV, ROLE_LABELS, type Capability, type StaffRole } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/format";

/**
 * Admin navigation. The link list is filtered by the caller's capabilities, so
 * a role never sees a destination the server would bounce them away from.
 */
export function AdminShell({
  role,
  capabilities,
  staffName,
  children,
}: {
  role: StaffRole;
  capabilities: readonly Capability[];
  staffName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const allowed = ADMIN_NAV.filter((item) => capabilities.includes(item.capability));
  const groups = Array.from(new Set(allowed.map((item) => item.group)));

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-ink-900/10 bg-rice-100/90 px-4 pt-safe backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-2">
          <span className="font-display text-base font-semibold text-ink-900">
            Panda Wok Ops
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="admin-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="grid size-10 place-items-center rounded-lg border border-ink-900/12 text-ink-800"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <nav
        id="admin-nav"
        aria-label="Admin sections"
        className={cn(
          "shrink-0 border-ink-900/10 bg-rice-100/95 lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-64 lg:overflow-y-auto lg:border-r",
          open ? "block border-b" : "hidden",
        )}
      >
        <div className="hidden px-4 pt-5 lg:block">
          <Link href="/admin" className="font-display text-lg font-semibold text-ink-900">
            Panda Wok Ops
          </Link>
          <p className="mt-0.5 text-xs text-ink-700/70">
            {staffName} · {ROLE_LABELS[role]}
          </p>
        </div>

        <div className="space-y-4 px-3 py-4 lg:pt-4">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-700/55">
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
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "block rounded-lg px-2.5 py-2 text-sm transition-colors",
                            active
                              ? "bg-plum-600 text-rice-50"
                              : "text-ink-800 hover:bg-ink-900/6",
                          )}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-ink-900/10 px-3 py-4">
          <Link
            href="/"
            className="block rounded-lg px-2.5 py-2 text-sm text-ink-700 hover:bg-ink-900/6"
          >
            View the customer site
          </Link>
        </div>
      </nav>

      <main id="main" className="min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
