"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  HelpCircle,
  Info,
  MapPin,
  Menu as MenuIcon,
  MessageSquare,
  MessagesSquare,
  Receipt,
  ShieldCheck,
  Star,
  User,
  X,
} from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils/format";

type MoreEntry = {
  href: string;
  labelKey: string;
  hintKey: string;
  icon: typeof Receipt;
};

/**
 * Every customer route that the two tab bars do not already expose. The point of
 * this list is coverage: an account route that exists but is linked from nowhere
 * is not shipped (see the chat incident in AGENTS.md), so anything private or
 * deep lives here rather than being assumed reachable from a parent screen.
 */
const ENTRIES: MoreEntry[] = [
  { href: "/orders", labelKey: "nav.orderTracking", hintKey: "nav.trackOrdersHint", icon: Receipt },
  { href: "/feedback", labelKey: "nav.rateOrder", hintKey: "nav.rateOrderHint", icon: Star },
  { href: "/loyalty", labelKey: "nav.loyalty", hintKey: "nav.loyaltyHint", icon: Award },
  { href: "/chat", labelKey: "nav.messages", hintKey: "nav.messagesHint", icon: MessagesSquare },
  { href: "/account", labelKey: "nav.account", hintKey: "nav.accountHint", icon: User },
  {
    href: "/account/addresses",
    labelKey: "account.addressesHeading",
    hintKey: "nav.addressesHint",
    icon: MapPin,
  },
  { href: "/location", labelKey: "nav.findUs", hintKey: "nav.findUsHint", icon: MapPin },
  { href: "/faq", labelKey: "nav.faq", hintKey: "nav.faqHint", icon: HelpCircle },
  { href: "/about", labelKey: "nav.about", hintKey: "nav.aboutHint", icon: Info },
  { href: "/contact", labelKey: "nav.contact", hintKey: "nav.contactHint", icon: MessageSquare },
  {
    href: "/privacy-policy",
    labelKey: "nav.privacy",
    hintKey: "nav.privacyHint",
    icon: ShieldCheck,
  },
];

/**
 * Phone-only "everything else" disclosure in the header. The bottom nav carries
 * the five things a customer does repeatedly; this carries the rest so no page
 * is a dead end. It is a bottom sheet rather than a side drawer so it reads as
 * a sibling of the tab bar, and it unlocks background scroll and closes on
 * Escape or any navigation.
 */
export function MobileNav({
  flags,
  signedIn,
}: {
  flags: Record<string, boolean>;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useT();

  const entries = ENTRIES.filter((e) => {
    if (e.href === "/loyalty" && flags.loyalty === false) return false;
    if (e.href === "/feedback" && flags.feedback === false) return false;
    if (e.href === "/chat" && flags.chat === false) return false;
    if (e.href.startsWith("/account") && !signedIn) return false;
    if (e.href === "/orders" && !signedIn) return false;
    return true;
  });

  // Escape closes the sheet, the background cannot scroll behind it, and the
  // scroll position is restored on unmount so the page does not jump.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex size-10 items-center justify-center rounded-lg border border-ink-900/12 text-ink-800 transition-colors hover:bg-ink-900/5 md:hidden"
      >
        <MenuIcon className="size-5" aria-hidden="true" />
        <span className="sr-only">{t("nav.more")}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.allPages")}
            className="glass-bar absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl pb-safe shadow-2xl"
          >
            <div className="mx-auto flex max-w-md items-center justify-between px-4 pt-4">
              <h2 className="font-display text-base font-semibold text-ink-900">
                {t("nav.allPages")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-ink-900/5"
              >
                <X className="size-5" aria-hidden="true" />
                <span className="sr-only">{t("common.close")}</span>
              </button>
            </div>

            <ul className="mx-auto grid max-w-md grid-cols-1 gap-1 px-3 pb-4 pt-2">
              {entries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <li key={entry.href}>
                    <Link
                      href={entry.href}
                      onClick={() => setOpen(false)}
                      aria-current={active(entry.href) ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                        active(entry.href) ? "bg-vermilion-600/10" : "hover:bg-ink-900/5",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg",
                          active(entry.href)
                            ? "bg-vermilion-600/15 text-vermilion-700"
                            : "bg-ink-900/6 text-ink-700",
                        )}
                      >
                        <Icon className="size-4.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink-900">
                          {t(entry.labelKey)}
                        </span>
                        <span className="block text-xs text-ink-700/70">{t(entry.hintKey)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
