import { Check, ChefHat, Circle, PackageCheck, Truck, X, Receipt } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils/format";
import type { TimelineStep } from "@/lib/services/order-status";
import type { Locale } from "@/lib/i18n/config";
import { statusHint, statusLabel } from "@/lib/i18n/orders";

const ICONS = {
  new: Receipt,
  accepted: Check,
  in_progress: ChefHat,
  prepared: PackageCheck,
  out_for_delivery: Truck,
  finished: Check,
} as const;

/**
 * Vertical progress rail. Completed steps are filled, the current step pulses
 * gently, upcoming steps stay outlined, and a terminal failure replaces the
 * remaining rail with a single red marker.
 *
 * Labels and hints are resolved here rather than in the workflow module, so
 * the state machine stays language-agnostic.
 */
export function OrderTimeline({
  steps,
  locale = "en",
}: {
  steps: TimelineStep[];
  locale?: Locale;
}) {
  return (
    <ol className="mt-4 space-y-0">
      {steps.map((step, index) => {
        const Icon =
          step.state === "failed" ? X : (ICONS[step.status as keyof typeof ICONS] ?? Circle);
        const last = index === steps.length - 1;

        return (
          <li key={`${step.status}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute start-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 rounded-full",
                  step.state === "done" ? "bg-jade-500/60" : "bg-ink-900/10",
                )}
              />
            ) : null}

            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2",
                step.state === "done" && "border-jade-500 bg-jade-500 text-rice-50",
                step.state === "current" &&
                  "border-vermilion-600 bg-vermilion-600 text-rice-50 animate-pulse-soft",
                step.state === "upcoming" &&
                  "border-ink-900/15 bg-rice-50 text-ink-700/40",
                step.state === "failed" && "border-chili-500 bg-chili-500 text-rice-50",
              )}
            >
              <Icon className="size-4" />
            </span>

            <div className="min-w-0 pt-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.state === "upcoming" ? "text-ink-700/60" : "text-ink-900",
                )}
              >
                {statusLabel(step.status, locale)}
                {step.state === "current" ? (
                  <span className="ms-2 text-xs font-normal text-vermilion-600">
                    {locale === "ar" ? "الآن" : "now"}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-ink-700/75">
                {statusHint(step.status, locale)}
              </p>
              {step.at ? (
                <p className="mt-0.5 text-[11px] text-ink-700/55">
                  {formatDateTime(step.at, locale)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
