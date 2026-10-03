import type { LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/utils/format";

export type StatTone = "neutral" | "warning" | "success" | "info";

const TONE_RING: Record<StatTone, string> = {
  neutral: "bg-vermilion-600/10 text-vermilion-600",
  warning: "bg-chili-500/12 text-chili-600",
  success: "bg-jade-500/14 text-jade-600",
  info: "bg-miso-500/14 text-miso-600",
};

/**
 * A dashboard figure with an optional sparkline. The sparkline is what turns a
 * number into a trend: "18 orders today" says little, "18 today, climbing"
 * says a lot, and it costs one inline SVG rather than a whole panel.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  trend?: number[];
}) {
  return (
    <div className="washi-panel flex flex-col p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-xl",
            TONE_RING[tone],
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="text-xs font-semibold tracking-wide text-ink-700/80 uppercase">
          {label}
        </span>
      </div>
      <p className="mt-2.5 font-display text-2xl font-semibold tabular-nums text-ink-900">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-700/65">{hint}</p> : null}
      {trend && trend.length > 1 ? (
        <div className="mt-2 -mb-1">
          <Sparkline values={trend} colorIndex={tone === "warning" ? 4 : 0} />
        </div>
      ) : null}
    </div>
  );
}
