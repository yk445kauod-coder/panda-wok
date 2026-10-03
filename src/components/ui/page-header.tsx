import { cn } from "@/lib/utils/format";

/**
 * The single page title block for every admin route. Pages previously each
 * hand-rolled an <h1> with drifted sizes and no consistent action slot.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-2xs font-semibold tracking-wide text-ink-600 uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-0.5 text-2xl font-semibold text-ink-900">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-ink-700/80">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

const TONES = {
  neutral: "text-ink-900",
  good: "text-jade-600",
  warn: "text-miso-600",
  bad: "text-chili-600",
  info: "text-bamboo-700",
} as const;

/**
 * Headline metric. `value` is deliberately allowed to be a plain string so
 * callers can pass a pre-formatted currency or a dash for "no data".
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof TONES;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("washi-panel p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-semibold tracking-wide text-ink-600 uppercase">
          {label}
        </p>
        {icon ? (
          <span className="text-ink-500" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 font-display text-2xl font-semibold tabular-nums",
          TONES[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-700/75">{hint}</p> : null}
    </div>
  );
}
