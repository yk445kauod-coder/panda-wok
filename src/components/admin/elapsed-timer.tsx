"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/format";

/** Minutes since a ticket was placed, coloured by how overdue it is. */
function tone(minutes: number) {
  if (minutes >= 25) return "border-chili-500/40 bg-chili-500/12 text-chili-600";
  if (minutes >= 12) return "border-miso-500/40 bg-miso-500/15 text-miso-600";
  return "border-ink-900/12 bg-rice-100 text-ink-700";
}

/**
 * Kitchen elapsed timer. Ticks locally every 15s so the pass shows real age
 * without a server round-trip. Renders a stable label on the server pass and
 * hydrates into a live clock.
 */
export function ElapsedTimer({
  since,
  className,
}: {
  since: string;
  className?: string;
}) {
  const start = new Date(since).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  if (Number.isNaN(start)) return null;

  const minutes = Math.max(0, Math.floor((now - start) / 60000));
  const label =
    minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

  return (
    <span
      title={`Placed ${new Date(start).toLocaleTimeString()}`}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-3xs font-semibold tabular-nums",
        tone(minutes),
        className,
      )}
    >
      {label}
    </span>
  );
}
