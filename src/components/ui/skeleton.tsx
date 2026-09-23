import { cn } from "@/lib/utils/format";

/**
 * Skeleton placeholders. Admin and detail routes previously had no loading
 * state at all, so the screen went blank during navigation.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-ink-900/8", className)}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * Page-level loading shell. Wrapped in a live region so assistive tech is told
 * the page is still arriving rather than silently empty.
 */
export function PageSkeleton({
  title = "Loading",
  rows = 6,
  className,
}: {
  title?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)} role="status" aria-live="polite">
      <span className="sr-only">{title}</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-washi" />
        ))}
      </div>
      <div className="washi-panel divide-y divide-ink-900/8">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
