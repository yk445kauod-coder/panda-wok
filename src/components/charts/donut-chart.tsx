"use client";

import { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { CHART_PALETTE, formatValue, SERIES_COLORS } from "./chart-utils";
import "./register";

export type Slice = { label: string; value: number };

/**
 * Doughnut for "what is this made of" — order status mix, loyalty tiers.
 *
 * `cutout` is high (68%) so the ring reads as a gauge rather than a pie, and
 * the legend is rendered as our own list rather than Chart.js's: it lets each
 * row show the count and share in the same tabular alignment as the rest of
 * the dashboard.
 */
export function DonutChart({
  data,
  title,
  height = 220,
  valueKind = "number",
  centerLabel,
}: {
  data: Slice[];
  title: string;
  height?: number;
  valueKind?: "number" | "currency";
  centerLabel?: string;
}) {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  const chartData = useMemo<ChartData<"doughnut">>(
    () => ({
      labels: data.map((d) => d.label),
      datasets: [
        {
          data: data.map((d) => d.value),
          backgroundColor: data.map((_, index) => SERIES_COLORS[index % SERIES_COLORS.length]),
          borderColor: CHART_PALETTE.rice50,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    }),
    [data],
  );

  const options = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: CHART_PALETTE.ink900,
          titleColor: CHART_PALETTE.rice100,
          bodyColor: CHART_PALETTE.rice100,
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label: (item) => {
              const value = Number(item.parsed);
              const share = total ? Math.round((value / total) * 100) : 0;
              return `${formatValue(value, valueKind)} · ${share}%`;
            },
          },
        },
      },
    }),
    [total, valueKind],
  );

  if (total <= 0) {
    return <p className="py-8 text-center text-sm text-ink-700/65">Nothing to show yet.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <Doughnut data={chartData} options={options} aria-label={title} />
        {centerLabel ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          >
            <span className="font-display text-xl font-semibold text-ink-900">
              {centerLabel}
            </span>
          </div>
        ) : null}
      </div>

      <ul className="w-full space-y-1.5">
        {data.map((slice, index) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-800">{slice.label}</span>
            <span className="font-medium tabular-nums text-ink-900">{slice.value}</span>
            <span className="w-9 shrink-0 text-end tabular-nums text-ink-700/60">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
