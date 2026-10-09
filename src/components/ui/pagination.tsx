import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/format";

/**
 * Cursor-free offset pagination that preserves every other query parameter.
 * No admin list had pagination before; they all silently truncated at a fixed
 * limit, so older rows were unreachable.
 */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  searchParams,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0 || pageCount <= 1) return null;

  const current = Math.min(Math.max(1, page), pageCount);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  function hrefFor(target: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value) params.set(key, value);
    }
    params.set("page", String(target));
    return `${basePath}?${params.toString()}`;
  }

  const linkClass =
    "inline-flex h-9 items-center gap-1 rounded-lg border border-ink-900/12 bg-rice-50 px-3 text-sm text-ink-800 hover:bg-rice-100";

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 pt-2",
        className,
      )}
    >
      <p className="text-xs text-ink-700/75">
        Showing <span className="font-medium text-ink-800">{from}–{to}</span> of{" "}
        <span className="font-medium text-ink-800">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {current > 1 ? (
          <Link href={hrefFor(current - 1)} rel="prev" className={linkClass}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={cn(linkClass, "pointer-events-none opacity-45")}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </span>
        )}
        <span className="text-xs text-ink-700/75" aria-current="page">
          Page {current} / {pageCount}
        </span>
        {current < pageCount ? (
          <Link href={hrefFor(current + 1)} rel="next" className={linkClass}>
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={cn(linkClass, "pointer-events-none opacity-45")}
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}

/** Parses and clamps a `page` search param. */
export function resolvePage(raw: string | undefined, pageCount?: number) {
  const parsed = Number.parseInt(raw ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return pageCount ? Math.min(page, Math.max(1, pageCount)) : page;
}

export const DEFAULT_PAGE_SIZE = 25;
