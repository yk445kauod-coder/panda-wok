"use client";

import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { CHART_PALETTE, formatValue, SERIES_COLORS, withAlpha } from "./chart-utils";
import "./register";

export type BarRow = { label: string; value: number; note?: string };

/**
 * Horizontal bars for ranked lists — top dishes, category revenue.
 *
 * Horizontal because the labels are dish and category names: reading them
 * upright beside the bar beats a rotated axis label on a phone. Chart.js is
 * told so with `indexAxis: "y"`, which flips the whole scale pair.
 */
export function BarList({
  data,
  title,
  height,
  valueKind = "number",
  emptyLabel = "No data in this window.",
}: {
  data: BarRow[];
  title: string;
  height?: number;
  valueKind?: "number" | "currency";
  emptyLabel?: string;
}) {
  const chartData = useMemo<ChartData<"bar">>(
    () => ({
      labels: data.map((d) => d.label),
      datasets: [
        {
          label: title,
          data: data.map((d) => d.value),
          backgroundColor: data.map(
            (_, index) => SERIES_COLORS[index % SERIES_COLORS.length],
          ),
          borderRadius: 6,
          borderSkipped: false,
          barThickness: 14,
        },
      ],
    }),
    [data, title],
  );

  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      indexAxis: "y",
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
            label: (item) => formatValue(Number(item.parsed.x), valueKind),
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: withAlpha(CHART_PALETTE.ink900, 0.08) },
          border: { display: false },
          ticks: {
            color: CHART_PALETTE.ink500,
            font: { size: 10 },
            maxTicksLimit: 4,
            callback: (value) => formatValue(Number(value), valueKind),
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: CHART_PALETTE.ink700, font: { size: 11 } },
        },
      },
    }),
    [valueKind],
  );

  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-700/65">{emptyLabel}</p>;
  }

  const computedHeight = height ?? Math.max(140, data.length * 40);

  return (
    <div style={{ height: computedHeight }} role="img" aria-label={title}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
