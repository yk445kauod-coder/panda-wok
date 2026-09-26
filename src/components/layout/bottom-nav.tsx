"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UtensilsCrossed, ShoppingBag, MessageSquareHeart, User } from "lucide-react";
import { useCart } from "@/components/customer/cart-provider";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils/format";

const ITEMS = [
  { href: "/", labelKey: "nav.home", icon: Home, flag: null },
  { href: "/menu", labelKey: "nav.menu", icon: UtensilsCrossed, flag: "menu" },
  { href: "/cart", labelKey: "nav.basket", icon: ShoppingBag, flag: "ordering" },
  { href: "/feedback", labelKey: "nav.feedback", icon: MessageSquareHeart, flag: "feedback" },
  { href: "/account", labelKey: "nav.account", icon: User, flag: "accounts" },
] as const;

/**
 * Bottom navigation sized for one-handed reach. Hidden modules are dropped
 * entirely rather than rendered as dead links, and the basket tab is only
 * active when ordering is switched on.
 *
 * Feedback sits here rather than order tracking because the reviews, contact and
 * complaint surface is what a customer reaches for between orders; tracking is
 * a link from the account page and from an order confirmation, where the
 * customer arrives with a specific order in mind.
 */
export function BottomNav({ flags }: { flags: Record<string, boolean> }) {
  const pathname = usePathname();
  const t = useT();
  const { itemCount, hydrated } = useCart();

  const visible = ITEMS.filter((item) => item.flag === null || flags[item.flag] !== false);

  // Hide the customer chrome inside auth and checkout to reduce distraction.
  if (pathname.startsWith("/checkout") || pathname.startsWith("/auth")) return null;

  return (
    <nav
      aria-label={t("nav.primary")}
      className="glass-bar fixed inset-x-0 bottom-0 z-40 pb-safe md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-1">
        {visible.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/cart" && hydrated && itemCount > 0;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-vermilion-300 drop-shadow-sm" : "text-rice-100/75 hover:text-rice-50",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  {showBadge ? (
                    <span className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-vermilion-600 px-1 text-[10px] font-bold leading-4 text-rice-50">
                      {itemCount > 99 ? "99+" : itemCount}
                    </span>
                  ) : null}
                </span>
                <span>{t(item.labelKey)}</span>
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
      </ul>
    </nav>
  );
}
