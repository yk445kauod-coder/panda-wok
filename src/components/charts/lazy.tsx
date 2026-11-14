"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { BarRow } from "@/components/charts/bar-list";
import type { Slice } from "@/components/charts/donut-chart";
import type { TrendPoint } from "@/components/charts/trend-chart";
import type { RadarAxis } from "@/components/charts/radar-chart";
import type { HeatCell } from "@/components/charts/heatmap";

/**
 * Charts, split off the console's first load.
 *
 * `chart.js` is ~67 KB gzip and is only used by the dashboard and the analytics
 * page — but a static import put it in the first-load bundle of all seventeen
 * console routes, so an operator opening the kitchen board or the orders list
 * paid for it on every page view. Every chart is loaded with `next/dynamic`
 * here instead, so the shell paints without it and the chart chunk is only
 * fetched by the two pages that draw something.
 *
 * The prop types are re-exported from the real components so a call site keeps
 * full type-checking without pulling the chart module into its bundle.
 */
export type { BarRow, Slice, TrendPoint, RadarAxis, HeatCell };

type TrendChartProps = {
  data: TrendPoint[];
  title: string;
  height?: number;
  valueKind?: "number" | "currency";
  colorIndex?: number;
};

type DonutChartProps = {
  data: Slice[];
  title: string;
  height?: number;
  valueKind?: "number" | "currency";
  centerLabel?: string;
};

type BarListProps = {
  data: BarRow[];
  title: string;
  height?: number;
  valueKind?: "number" | "currency";
  emptyLabel?: string;
};

type GaugeChartProps = {
  value: number;
  max?: number;
  size?: number;
  label: string;
  sublabel?: string;
  colorIndex?: number;
};

type RadarChartProps = {
  axes: RadarAxis[];
  title: string;
  height?: number;
  colorIndex?: number;
};

type HeatmapProps = {
  cells: HeatCell[];
  xLabels: string[];
  yLabels: string[];
  title: string;
  height?: number;
};

type SparklineProps = { values: number[]; colorIndex?: number };


/**
 * A chart-sized placeholder shown while the chart chunk downloads, so the panel
 * does not jump when the chart replaces it.
 */
function placeholder(height: number) {
  return function ChartPlaceholder() {
    return (
      <div
        aria-hidden="true"
        className="w-full animate-pulse-soft rounded-xl bg-ink-900/5"
        style={{ height }}
      />
    );
  };
}

const load = <P,>(
  loader: () => Promise<ComponentType<P>>,
  height: number,
): ComponentType<P> =>
  dynamic(loader as () => Promise<ComponentType<unknown>>, {
    ssr: false,
    loading: placeholder(height),
  }) as ComponentType<P>;

export const TrendChart = load<TrendChartProps>(
  () => import("@/components/charts/trend-chart").then((m) => m.TrendChart),
  220,
);

export const DonutChart = load<DonutChartProps>(
  () => import("@/components/charts/donut-chart").then((m) => m.DonutChart),
  220,
);

export const BarList = load<BarListProps>(
  () => import("@/components/charts/bar-list").then((m) => m.BarList),
  260,
);

export const GaugeChart = load<GaugeChartProps>(
  () => import("@/components/charts/gauge-chart").then((m) => m.GaugeChart),
  150,
);

export const RadarChart = load<RadarChartProps>(
  () => import("@/components/charts/radar-chart").then((m) => m.RadarChart),
  240,
);

export const Heatmap = load<HeatmapProps>(
  () => import("@/components/charts/heatmap").then((m) => m.Heatmap),
  220,
);

export const Sparkline = load<SparklineProps>(
  () => import("@/components/charts/sparkline").then((m) => m.Sparkline),
  28,
);
