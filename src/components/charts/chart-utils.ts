/**
 * Theme bridge for Chart.js.
 *
 * Chart.js paints onto a `<canvas>`, so it cannot read the CSS custom
 * properties in globals.css the way an SVG chart can. These constants are the
 * literal values of those tokens and are the single place a palette change has
 * to be mirrored — everything else imports from here.
 *
 * Keep in sync with the `@theme` block at the top of src/app/globals.css.
 */
export const CHART_PALETTE = {
  rice50: "#fdfbf5",
  rice100: "#f7f3e8",
  rice200: "#ece5d3",
  ink400: "#8a8078",
  ink500: "#6d655c",
  ink600: "#4d463f",
  ink700: "#37312b",
  ink900: "#17130f",
  vermilion400: "#e79b78",
  vermilion500: "#d0694a",
  vermilion600: "#b1454a",
  vermilion700: "#8c2f39",
  miso300: "#e7c182",
  miso500: "#c2863a",
  miso600: "#9d6620",
  jade500: "#3f8874",
  jade600: "#2f6a5a",
  bamboo500: "#7f9159",
  bamboo600: "#617244",
  chili500: "#bb4130",
  chili600: "#982e1f",
} as const;

/** Categorical series colours, in the order the brand would use them. */
export const SERIES_COLORS = [
  CHART_PALETTE.vermilion600,
  CHART_PALETTE.miso500,
  CHART_PALETTE.jade500,
  CHART_PALETTE.bamboo500,
  CHART_PALETTE.chili500,
  CHART_PALETTE.vermilion400,
  CHART_PALETTE.miso300,
  CHART_PALETTE.jade600,
];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/** Translucent variant of a palette hex, for area fills and hover states. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatValue(value: number, kind: "number" | "currency" = "number"): string {
  if (kind === "currency") {
    return `${Math.round(value).toLocaleString("en-US")} EGP`;
  }
  return value.toLocaleString("en-US");
}

