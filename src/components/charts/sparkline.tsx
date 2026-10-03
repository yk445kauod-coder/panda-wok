"use client";

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { seriesColor, withAlpha } from "./chart-utils";
import "./register";

/**
 * Sparkline for a stat card: a miniature trend with every axis, tick and
 * tooltip switched off, so a card can say "and this is the direction it is
 * going" without spending a panel on it.
 *
 * `events: []` plus a null tooltip keeps the pointer entirely inert, so tapping
 * the card still hits whatever the card wraps.
 */
export function Sparkline({
  values,
  height = 40,
  colorIndex = 0,
}: {
  values: number[];
  height?: number;
  colorIndex?: number;
}) {
  const color = seriesColor(colorIndex);

  const chartData = useMemo<ChartData<"line">>(
    () => ({
      labels: values.map((_, index) => String(index)),
      datasets: [
        {
          data: values,
          borderColor: color,
          backgroundColor: withAlpha(color, 0.14),
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    }),
    [values, color],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      events: [],
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    }),
    [],
  );

  if (values.length < 2) return null;

  return (
    <div style={{ height }} aria-hidden="true">
      <Line data={chartData} options={options} />
    </div>
  );
}
