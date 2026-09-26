import { cn } from "@/lib/utils/format";

/**
 * Serene empty state. Used wherever a list can legitimately be empty, so the
 * UI never shows a blank region without explanation.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "washi-panel flex flex-col items-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-bamboo-300/30 text-bamboo-700"
      >
        {icon ?? <EnsoMark className="size-6" />}
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description ? (
        <p className="max-w-prose text-sm text-ink-700/80">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Minimal enso circle, drawn inline so it costs no request. */
export function EnsoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.5c4.7 0 8.5 3.8 8.5 8.5S16.7 20.5 12 20.5 3.5 16.7 3.5 12c0-3.4 2-6.4 5-7.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
