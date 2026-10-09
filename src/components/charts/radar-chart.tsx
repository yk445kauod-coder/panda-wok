"use client";

import { useMemo } from "react";
import { Radar } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { CHART_PALETTE, seriesColor, withAlpha } from "./chart-utils";
import "./register";

export type RadarAxis = { label: string; value: number; display?: string };

/**
 * Radar for comparing several measures on one shape — how a period scores
 * across orders, revenue, customers and satisfaction at once. Each axis is
 * scaled against its own maximum, because raw revenue and raw order counts
 * share no unit.
 *
 * `display` carries the real figure so the tooltip prints that rather than the
 * normalised 0-100 value used for placement.
 */
export function RadarChart({
  axes,
  title,
  height = 240,
  colorIndex = 0,
}: {
  axes: RadarAxis[];
  title: string;
  height?: number;
  colorIndex?: number;
}) {
  const color = seriesColor(colorIndex);

  const chartData = useMemo<ChartData<"radar">>(
    () => ({
      labels: axes.map((a) => a.label),
      datasets: [
        {
          label: title,
          data: axes.map((a) => a.value),
          borderColor: color,
          backgroundColor: withAlpha(color, 0.2),
          pointBackgroundColor: color,
          pointBorderColor: CHART_PALETTE.rice50,
          pointRadius: 3,
          borderWidth: 2,
        },
      ],
    }),
    [axes, title, color],
  );

  const options = useMemo<ChartOptions<"radar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: CHART_PALETTE.ink900,
          titleColor: CHART_PALETTE.rice100,
          bodyColor: CHART_PALETTE.rice100,
          padding: 10,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label: (item) => axes[item.dataIndex]?.display ?? String(item.parsed.r),
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          grid: { color: withAlpha(CHART_PALETTE.ink900, 0.1) },
          angleLines: { color: withAlpha(CHART_PALETTE.ink900, 0.1) },
          pointLabels: { color: CHART_PALETTE.ink700, font: { size: 11 } },
          ticks: { display: false },
        },
      },
    }),
    [axes],
  );

  if (axes.length < 3) return null;

  return (
    <div style={{ height }} role="img" aria-label={title}>
      <Radar data={chartData} options={options} />
    </div>
  );
}
