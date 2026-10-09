"use client";

import { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { CHART_PALETTE, seriesColor, withAlpha } from "./chart-utils";
import "./register";

/**
 * Radial gauge for a single figure with a natural ceiling — an average rating
 * out of five, a share of something. A ring communicates "how full" at a glance
 * far better than a bare number does.
 *
 * Built on a doughnut with rotation set so the arc starts at 12 o'clock and
 * sweeps clockwise, which is the direction people read a dial.
 */
export function GaugeChart({
  value,
  max = 5,
  size = 150,
  label,
  sublabel,
  colorIndex = 1,
}: {
  value: number;
  max?: number;
  size?: number;
  label: string;
  sublabel?: string;
  colorIndex?: number;
}) {
  const safeMax = max > 0 ? max : 1;
  const filled = Math.min(safeMax, Math.max(0, value));
  const color = seriesColor(colorIndex);

  const chartData = useMemo<ChartData<"doughnut">>(
    () => ({
      labels: [label, "rest"],
      datasets: [
        {
          data: [filled, Math.max(0, safeMax - filled)],
          backgroundColor: [color, withAlpha(CHART_PALETTE.ink900, 0.08)],
          borderWidth: 0,
          circumference: 270,
          rotation: 225,
        },
      ],
    }),
    [filled, safeMax, label, color],
  );

  const options = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "74%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      events: [],
    }),
    [],
  );

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} out of ${safeMax}${sublabel ? ` (${sublabel})` : ""}`}
    >
      <Doughnut data={chartData} options={options} />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-2">
        <span className="font-display text-2xl font-semibold text-ink-900">{label}</span>
        {sublabel ? (
          <span className="text-2xs text-ink-700/65">{sublabel}</span>
        ) : null}
      </div>
    </div>
  );
}
