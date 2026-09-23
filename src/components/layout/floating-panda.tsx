"use client";

import { useEffect, useRef } from "react";
import { Mascot } from "page-mascot";
import { useAssistant } from "@/components/panda/assistant-context";

/**
 * Floating panda companion. Sits above the bottom nav on phones and bottom-right
 * on desktop, turns its face toward the pointer (subtle rotation + translate, rAF
 * throttled),breathes softly, and opens the Panda assistant when tapped. The
 * enso ring behind it hints at the kaligrafi mark without drawing a second logo.

 * Pure CSS transitions (no layout thrash);positions track the movement ratio so the
 * panda leans ever so slightly toward the cursor, never jumps or covers content.
 */
export function FloatingPanda() {
  const { openAssistant } = useAssistant();
  const frame = useRef<number | null>(null);
  const current = useRef({ x: 0.5, y: 0.5 });
  const target = useRef({ x: 0.5, y: 0.5 });
  const face = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onMove = (event: PointerEvent) => {
      target.current = {
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      };
      if (reduced) apply();
    };

    const onTick = () => {
      const c = current.current;
      c.x += (target.current.x - c.x) * 0.08;
      c.y += (target.current.y - c.y) * 0.08;
      apply();

      frame.current = requestAnimationFrame(onTick);
    };

    const apply = () => {
      const el = face.current;
      if (!el) return;
      const dx = (current.current.x - 0.5) * 2; // -1..1
      const dy = (current.current.y - 0.5) * 1.2;
      el.style.transform = `rotate(${(dx * 8 + dy * 4).toFixed(2)}deg) translate(${(dx * -10).toFixed(2)}px, ${(dy * -6).toFixed(2)}px)`;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    if (!reduced) {
      frame.current = requestAnimationFrame(onTick);
    } else {
      apply();
    }

    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div className="fixed bottom-24 right-3 z-40 md:bottom-6 md:right-6">
      <div
        role="button"
        tabIndex={0}
        aria-label="Ask Panda Wok assistant"
        onClick={() => openAssistant()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openAssistant();
          }
        }}
        className="group relative grid size-16 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-plum-500/60"
      >
        <span
          aria-hidden="true"
          className="enso-ring absolute inset-0 rounded-full border border-ink-900/15"
          data-motion="enso"
        />
        <span
          aria-hidden="true"
          className="absolute inset-1 rounded-full bg-plum-500/10 blur-sm"
        />
        <div ref={face} className="relative will-change-transform">
          <div className="transition-transform duration-300 ease-out group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none">
            <Mascot
              directions="/mascots/panda-directions.webp"
              reactions="/mascots/panda-reactions.webp"
              size={52}
              label="Panda Wok assistant"
            />
          </div>
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-ink-900/80 px-2 py-0.5 text-[10px] font-medium tracking-wide text-rice-50 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          Ask Panda
        </span>
      </div>
    </div>
  );
}