"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useT } from "@/components/i18n-provider";

/**
 * Client-side search bar. It writes to the query string so a search is
 * shareable and back-button friendly, and it debounces the free-text input.
 *
 * There is deliberately no dietary filter here. The pills that used to sit
 * below the search box were a fixed list — "Available now", "Spicy",
 * "Vegetarian", "Vegan" — invented in the component rather than read from the
 * kitchen's own data, and they filtered on flags the kitchen had not
 * necessarily set. The search box matches names and descriptions in both
 * languages, which covers the same intent without asserting anything the menu
 * does not say.
 */
export function MenuFilters({ initialQuery }: { initialQuery: string }) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query === initialQuery) return;
      const trimmed = query.trim();
      startTransition(() => {
        router.replace(trimmed ? `/menu?q=${encodeURIComponent(trimmed)}` : "/menu", {
          scroll: false,
        });
      });
    }, 320);
    return () => clearTimeout(timer);
    // initialQuery intentionally omitted: it changes on navigation and
    // re-running would fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, router]);

  return (
    <div className="mt-5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-700/50"
          aria-hidden="true"
        />
        <label htmlFor="menu-search" className="sr-only">
          {t("menu.searchLabel")}
        </label>
        <input
          id="menu-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("menu.searchPlaceholder")}
          className="h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 ps-9 pe-20 text-sm outline-none focus:border-miso-500"
        />
        {pending ? (
          <span className="absolute end-10 top-1/2 -translate-y-1/2 text-[11px] text-ink-700/50">
            {t("menu.updating")}
          </span>
        ) : null}
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("menu.clearSearch")}
            className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-ink-700/60 hover:bg-ink-900/5"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
