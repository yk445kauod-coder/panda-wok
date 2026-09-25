/**
 * AsianFrames — reusable decorative frame furniture for customer pages.
 *
 * Two pieces, all non-interactive and hidden from assistive tech:
 *  - `BambooRails` stands two translucent bamboo culms down the page edges.
 *  - `AsanohaPanel` lays the hemp-leaf lattice behind a section.
 *
 * Every piece is pure CSS (see globals.css), so it costs no image request and
 * disappears cleanly under `prefers-reduced-motion` (motion is ambient only).
 */
export function BambooRails({ flip = false }: { flip?: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-motion="decorative"
      className="pointer-events-none absolute inset-y-0 hidden lg:block"
      style={{ [flip ? "insetInlineStart" : "insetInlineEnd"]: "1.5rem" } as React.CSSProperties}
    >
      <span className="bamboo-frame block h-full w-2.5 rounded-full opacity-60" />
      <span
        className="bamboo-frame absolute top-16 block h-[78%] w-1.5 rounded-full opacity-35"
        style={{ [flip ? "insetInlineStart" : "insetInlineEnd"]: "-14px" } as React.CSSProperties}
      />
    </div>
  );
}

export function AsanohaPanel({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-motion="decorative"
      className={`asanoha pointer-events-none absolute inset-0 ${className ?? "opacity-70"}`}
    />
  );
}
