"use client";

import { useMemo } from "react";
import { Chart } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { CHART_PALETTE, SERIES_COLORS, seriesColor, withAlpha } from "./chart-utils";
import "./register";

export type HeatCell = { x: string; y: string; value: number };

/**
 * Matrix heatmap (chartjs-chart-matrix). Renders a grid of cells tinted by
 * value, which shows the *pattern* of busy and quiet periods in a way a line
 * chart cannot — day-of-week by hour, weekday by week.
 *
 * Colour is a single-hue ramp from a translucent token to the full colour, so
 * an empty cell reads as "nothing happened" rather than as a low value.
 */
export function Heatmap({
  cells,
  xLabels,
  yLabels,
  title,
  height = 220,
}: {
  cells: HeatCell[];
  xLabels: string[];
  yLabels: string[];
  title: string;
  height?: number;
}) {
  const max = useMemo(() => Math.max(...cells.map((c) => c.value), 1), [cells]);
  const base = seriesColor(2);

  const chartData = useMemo<ChartData<"matrix">>(
    () => ({
      datasets: [
        {
          label: title,
          data: cells.map((cell) => ({ x: cell.x, y: cell.y, v: cell.value })),
          backgroundColor: (context) => {
            const raw = context.raw as { v?: number } | undefined;
            const value = raw?.v ?? 0;
            if (value === 0) return withAlpha(CHART_PALETTE.ink900, 0.06);
            return withAlpha(base, 0.25 + (value / max) * 0.75);
          },
          borderColor: CHART_PALETTE.rice50,
          borderWidth: 1,
          width: ({ chart }) =>
            (chart.chartArea?.width ?? 300) / Math.max(1, xLabels.length) - 2,
          height: ({ chart }) =>
            (chart.chartArea?.height ?? 150) / Math.max(1, yLabels.length) - 2,
        },
      ],
    }),
    [cells, title, xLabels.length, yLabels.length, max, base],
  );

  const options = useMemo<ChartOptions<"matrix">>(
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
            title: (items) => {
              const raw = items[0]?.raw as { x?: string; y?: string } | undefined;
              return raw ? `${raw.y} · ${raw.x}` : "";
            },
            label: (item) => {
              const raw = item.raw as { v?: number } | undefined;
              return `${raw?.v ?? 0} ${title}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "category",
          labels: xLabels,
          grid: { display: false },
          border: { display: false },
          ticks: { color: CHART_PALETTE.ink500, font: { size: 10 } },
        },
        y: {
          type: "category",
          labels: yLabels,
          offset: true,
          grid: { display: false },
          border: { display: false },
          ticks: { color: CHART_PALETTE.ink700, font: { size: 10 } },
        },
      },
    }),
    [xLabels, yLabels, title],
  );

  if (cells.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-700/65">No data to plot.</p>;
  }

  return (
    <div style={{ height }} role="img" aria-label={title}>
      <Chart type="matrix" data={chartData} options={options} />
    </div>
  );
}

export { SERIES_COLORS };
