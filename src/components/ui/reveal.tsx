"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/format";

/**
 * Reveals its children as they scroll into view. Purely decorative: content is
 * always in the DOM, so it is readable, selectable and indexable regardless of
 * the observer.
 *
 * The initial render is "shown", so with JS disabled nothing is ever hidden.
 * A layout effect (which runs before paint, so there is no flash) demotes
 * below-the-fold elements to "pending"; the observer then promotes them back to
 * "shown" on scroll. Reduced-motion users skip the pending state entirely.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
  "aria-labelledby": ariaLabelledby,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger in ms, for lists of cards. */
  delay?: number;
  as?: "div" | "section" | "li" | "article" | "header";
  /** Forwarded to the tag when `as="section"` keeps section semantics intact. */
  "aria-labelledby"?: string;
}) {
  const [state, setState] = useState<"shown" | "pending">("shown");
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") return;

    if (node.getBoundingClientRect().top > window.innerHeight * 0.9) {
      setState("pending");
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== node) continue;
          setState(entry.isIntersecting ? "shown" : "pending");
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-reveal={state}
      aria-labelledby={ariaLabelledby}
      style={state === "shown" && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
