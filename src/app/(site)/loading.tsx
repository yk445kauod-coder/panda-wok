import { EnsoMark } from "@/components/ui/empty-state";

/** Route-level loading skeleton. Mirrors the washi panel rhythm so nothing jumps. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <EnsoMark className="mx-auto size-14 animate-sway text-vermilion-600/50" />

      <div className="mt-6 space-y-3">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-rice-300/60" />
        <div className="h-4 w-72 animate-pulse rounded bg-rice-300/45" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="washi-panel p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-rice-300/55" />
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-rice-300/40" />
            <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-rice-300/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
