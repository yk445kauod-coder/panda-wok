"use client";

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { CHART_PALETTE, formatValue, seriesColor, withAlpha } from "./chart-utils";
import "./register";

export type TrendPoint = { label: string; value: number };

/**
 * Area + line trend via Chart.js. The dashboard centrepiece: one series over
 * time, filled so volume is legible at a glance, with Chart.js's own tooltip
 * giving the exact figure on hover and tap.
 *
 * Grid is horizontal only — vertical rules add noise here and the x labels
 * already separate the columns.
 */
export function TrendChart({
  data,
  title,
  height = 220,
  valueKind = "currency",
  colorIndex = 0,
}: {
  data: TrendPoint[];
  title: string;
  height?: number;
  valueKind?: "number" | "currency";
  colorIndex?: number;
}) {
  const color = seriesColor(colorIndex);

  const chartData = useMemo<ChartData<"line">>(
    () => ({
      labels: data.map((d) => d.label),
      datasets: [
        {
          label: title,
          data: data.map((d) => d.value),
          borderColor: color,
          backgroundColor: withAlpha(color, 0.18),
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: CHART_PALETTE.rice50,
          pointHoverBorderWidth: 2,
          borderWidth: 2.5,
        },
      ],
    }),
    [data, title, color],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
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
            label: (item) => formatValue(item.parsed.y ?? 0, valueKind),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: CHART_PALETTE.ink500,
            maxRotation: 0,
            autoSkipPadding: 24,
            font: { size: 10 },
          },
        },
        y: {
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
      },
    }),
    [valueKind],
  );

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-700/65">
        No data recorded in this window.
      </p>
    );
  }

  return (
    <div style={{ height }} role="img" aria-label={title}>
      <Line data={chartData} options={options} />
    </div>
  );
}
