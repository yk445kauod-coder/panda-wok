import { Star } from "lucide-react";
import { cn } from "@/lib/utils/format";

/**
 * A dish's star average, or nothing at all.
 *
 * There is deliberately no default or fallback score: `rating` comes from
 * `menu_item_ratings`, which is empty until a customer has consented to a
 * rating on a real order. When it is absent the component renders `null`, so
 * an unrated dish shows no stars rather than a fabricated "4.9".
 *
 * The count is printed beside the average because a lone 5.0 and an average of
 * five hundred 5.0s are not the same claim, and the reader deserves to know
 * which one they are looking at.
 *
 * Server component — no interactivity, so no "use client" boundary.
 */
export function StarRating({
  rating,
  className,
  tone = "onLight",
  showCount = true,
  countLabel,
  oneLabel,
  label,
}: {
  rating: { average: number; count: number } | null | undefined;
  className?: string;
  /** `onLight` for rice panels, `onBand` for the coloured sections. */
  tone?: "onLight" | "onBand";
  showCount?: boolean;
  /** Pre-translated count strings, so this stays a server component. */
  countLabel?: (count: number) => string;
  oneLabel?: string;
  /** Accessible description, e.g. "4.6 out of 5". */
  label?: string;
}) {
  if (!rating || rating.count < 1) return null;

  const filled = Math.round(rating.average);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        tone === "onBand" ? "text-rice-100/90" : "text-ink-700/85",
        className,
      )}
      title={label}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <Star
            key={index}
            className={cn(
              "size-3.5",
              index < filled
                ? "fill-miso-500 text-miso-500"
                : tone === "onBand"
                  ? "text-rice-100/35"
                  : "text-ink-400/50",
            )}
          />
        ))}
      </span>
      <span className="tabular-nums">{rating.average.toFixed(1)}</span>
      {showCount ? (
        <span
          className={cn(
            tone === "onBand" ? "text-rice-100/70" : "text-ink-700/65",
          )}
        >
          {rating.count === 1
            ? (oneLabel ?? "1")
            : (countLabel?.(rating.count) ?? `(${rating.count})`)}
        </span>
      ) : null}
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
