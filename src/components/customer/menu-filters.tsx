"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/format";

const DIETS = [
  { key: "", label: "Everything" },
  { key: "available", label: "Available now" },
  { key: "spicy", label: "Spicy" },
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
] as const;

/**
 * Client-side filter bar. It writes to the query string so a filtered menu is
 * shareable and back-button friendly, and it debounces the free-text search.
 */
export function MenuFilters({
  initialQuery,
  initialDiet,
}: {
  initialQuery: string;
  initialDiet: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [diet, setDiet] = useState(initialDiet);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query === initialQuery && diet === initialDiet) return;
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (diet) params.set("diet", diet);
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `/menu?${qs}` : "/menu", { scroll: false });
      });
    }, 320);
    return () => clearTimeout(timer);
    // initialQuery/initialDiet intentionally omitted: they change on navigation
    // and re-running would fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, diet, router]);

  return (
    <div className="mt-5 space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-700/50"
          aria-hidden="true"
        />
        <label htmlFor="menu-search" className="sr-only">
          Search the menu
        </label>
        <input
          id="menu-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search dishes…"
          className="h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 pl-9 pr-10 text-sm outline-none focus:border-miso-500"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-ink-700/60 hover:bg-ink-900/5"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        {pending ? (
          <span className="absolute right-10 top-1/2 -translate-y-1/2 text-[11px] text-ink-700/50">
            updating…
          </span>
        ) : null}
      </div>

      <div
        role="group"
        aria-label="Dietary filter"
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4"
      >
        {DIETS.map((option) => {
          const active = diet === option.key;
          return (
            <button
              key={option.key || "all"}
              type="button"
              onClick={() => setDiet(option.key)}
              aria-pressed={active}
              className={cn(
                "whitespace-nowrap rounded-full border px-3.5 py-2 text-sm transition-colors",
                active
                  ? "border-plum-600 bg-plum-600 text-rice-50"
                  : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
