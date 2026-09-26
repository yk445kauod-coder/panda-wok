import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils/format";

/**
 * Reveals its children as they scroll into view.
 *
 * This is a **server component with no JavaScript**: the effect is a CSS
 * scroll-driven animation (`animation-timeline: view()`) declared in
 * globals.css. It used to be a client component holding an
 * `IntersectionObserver` and a `useState`, which had two real costs:
 *
 *  1. Every one of the ~60 call sites became a client boundary. On /menu that
 *     wrapped the dish grids, so all 53 `DishCard`s were re-rendered on the
 *     client at hydration purely to be wrapped in a div, and every card's
 *     subtree had to be reconciled on the main thread.
 *  2. The observer demoted elements to `pending` in a layout effect and
 *     promoted them back on scroll, so the browser re-composited a
 *     `blur(4px)` filter on dozens of cards while scrolling.
 *
 * Content is always in the DOM and is never hidden: the animation lives inside
 * an `@supports` + `prefers-reduced-motion` block, so a browser without
 * scroll-driven animations renders the final state immediately.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
  variant = "up",
  "aria-labelledby": ariaLabelledby,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Stagger for a list of cards, in ms. A scrubbed animation has no clock to
   * delay, so this shortens the animation's entry window instead: a card with a
   * larger delay starts its fade further along its own scroll progress, which
   * reads as the same left-to-right cascade.
   */
  delay?: number;
  as?: "div" | "section" | "li" | "article" | "header";
  /**
   * Entry direction. `left`/`right` are mirrored under RTL by CSS, so they mean
   * "from the start edge" and "from the end edge" rather than a screen side.
   */
  variant?: "up" | "left" | "right" | "zoom" | "flip";
  /** Forwarded to the tag when `as="section"` keeps section semantics intact. */
  "aria-labelledby"?: string;
}) {
  return (
    <Tag
      data-reveal=""
      data-reveal-variant={variant}
      aria-labelledby={ariaLabelledby}
      style={
        delay
          ? ({ "--reveal-delay": `${Math.min(delay, 320) / 320}` } as CSSProperties)
          : undefined
      }
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
