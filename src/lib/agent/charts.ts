import "server-only";

/**
 * Inline-SVG charts for the agent's HTML deliverables.
 *
 * These are strings of markup, not a charting library, and that is deliberate:
 * a filed artifact must still render in five years, on a machine with no
 * network, opened from a downloads folder. A CDN script tag or a client-side
 * canvas would break all three. Every chart here is pure SVG plus inline CSS,
 * so the file is self-contained and prints correctly.
 *
 * The numbers are always passed in — nothing is sampled, smoothed or invented.
 * A chart is a rendering of data the caller already queried, never a source of
 * it. When there is nothing to draw, the caller renders an empty-state line
 * instead of a chart with a made-up axis.
 */

const INK = "#1c2a24";
const MUTED = "#6b7b74";
const GRID = "#e2e0d6";
const ACCENT = "#2f6f52";
const SERIES = ["#2f6f52", "#b4632a", "#3f6f8f", "#8f6f3f", "#6f3f8f", "#3f8f6f"];

export type Series = { label: string; value: number };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: number): string {
  return `${value.toFixed(2)} EGP`;
}

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

/**
 * Vertical bars. Used for revenue-by-day and similar time series.
 *
 * Bars are drawn from a real baseline so a zero value renders as nothing
 * visible rather than a sliver that implies a sale happened.
 */
export function barChart(
  series: Series[],
  opts: { height?: number; width?: number; valueFormat?: (n: number) => string; title?: string } = {},
): string {
  if (series.length === 0) return emptyChart(opts.title ?? "No data in this window.");
  const width = opts.width ?? 720;
  const height = opts.height ?? 220;
  const fmt = opts.valueFormat ?? ((n: number) => n.toFixed(0));
  const padLeft = 64;
  const padBottom = 34;
  const plotW = width - padLeft - 12;
  const plotH = height - padBottom - 12;
  const max = niceMax(Math.max(...series.map((s) => s.value), 0));
  const slot = plotW / series.length;
  const barW = Math.max(2, Math.min(38, slot * 0.6));

  const bars = series
    .map((s, i) => {
      const h = max > 0 ? (s.value / max) * plotH : 0;
      const x = padLeft + i * slot + (slot - barW) / 2;
      const y = 12 + plotH - h;
      const label = series.length <= 16 || i % Math.ceil(series.length / 12) === 0;
      return `
    <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${ACCENT}" rx="2">
      <title>${escapeXml(s.label)}: ${escapeXml(fmt(s.value))}</title>
    </rect>
    ${label ? `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 14}" font-size="10" fill="${MUTED}" text-anchor="middle">${escapeXml(s.label)}</text>` : ""}`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeXml(opts.title ?? "Bar chart")}" style="max-width:${width}px">
    <line x1="${padLeft}" y1="12" x2="${padLeft}" y2="${12 + plotH}" stroke="${GRID}" />
    <line x1="${padLeft}" y1="${12 + plotH}" x2="${width - 12}" y2="${12 + plotH}" stroke="${GRID}" />
    <text x="8" y="18" font-size="10" fill="${MUTED}">${escapeXml(fmt(max))}</text>
    <text x="8" y="${12 + plotH}" font-size="10" fill="${MUTED}">0</text>
${bars}
  </svg>`;
}

/** Horizontal bars, for ranked lists where the labels are long. */
export function rankedBarChart(series: Series[], opts: { valueFormat?: (n: number) => string; title?: string } = {}): string {
  if (series.length === 0) return emptyChart(opts.title ?? "Nothing to rank.");
  const fmt = opts.valueFormat ?? ((n: number) => n.toFixed(0));
  const max = Math.max(...series.map((s) => s.value), 0) || 1;
  const rows = series
    .map((s, i) => {
      const pct = (s.value / max) * 100;
      return `<tr>
      <td class="rk-label">${escapeXml(s.label)}</td>
      <td class="rk-track"><span class="rk-fill" style="width:${pct.toFixed(1)}%;background:${SERIES[i % SERIES.length]}"></span></td>
      <td class="rk-value">${escapeXml(fmt(s.value))}</td>
    </tr>`;
    })
    .join("");
  return `<table class="ranked">${rows}</table>`;
}

/**
 * A donut for composition. Percentages are computed from the values, and the
 * legend states the raw count beside each share so a reader never has to
 * reverse-engineer a number from an arc.
 */
export function donutChart(
  series: Series[],
  opts: { title?: string; valueFormat?: (n: number) => string } = {},
): string {
  const total = series.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return emptyChart(opts.title ?? "No composition to show.");
  const fmt = opts.valueFormat ?? money;
  const size = 200;
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = series
    .map((s, i) => {
      const frac = s.value / total;
      const dash = `${(frac * c).toFixed(2)} ${(c - frac * c).toFixed(2)}`;
      const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
      stroke="${SERIES[i % SERIES.length]}" stroke-width="28"
      stroke-dasharray="${dash}" stroke-dashoffset="${(-offset * c).toFixed(2)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"><title>${escapeXml(s.label)}: ${escapeXml(fmt(s.value))}</title></circle>`;
      offset += frac;
      return arc;
    })
    .join("");
  const legend = series
    .map(
      (s, i) =>
        `<li><span class="dot" style="background:${SERIES[i % SERIES.length]}"></span>${escapeXml(s.label)} — ${escapeXml(fmt(s.value))} (${((s.value / total) * 100).toFixed(1)}%)</li>`,
    )
    .join("");
  return `<div class="donut-wrap">
    <svg viewBox="0 0 ${size} ${size}" width="200" height="200" role="img" aria-label="${escapeXml(opts.title ?? "Composition")}">${arcs}</svg>
    <ul class="legend">${legend}</ul>
  </div>`;
}

/** Horizontal progress bars for rates such as completion or repeat-purchase. */
export function gaugeRows(series: Series[], opts: { max?: number; valueFormat?: (n: number) => string } = {}): string {
  const max = opts.max ?? Math.max(...series.map((s) => s.value), 1);
  const fmt = opts.valueFormat ?? ((n: number) => n.toFixed(0));
  return `<table class="ranked">${series
    .map(
      (s) =>
        `<tr><td class="rk-label">${escapeXml(s.label)}</td><td class="rk-track"><span class="rk-fill" style="width:${((s.value / max) * 100).toFixed(1)}%;background:${ACCENT}"></span></td><td class="rk-value">${escapeXml(fmt(s.value))}</td></tr>`,
    )
    .join("")}</table>`;
}

export function emptyChart(message: string): string {
  return `<p class="chart-empty">${escapeXml(message)}</p>`;
}

export const CHART_CSS = `
  .chart-empty { color:${MUTED}; font-style:italic; margin:8px 0; }
  .ranked { width:100%; border-collapse:collapse; }
  .ranked td { padding:4px 8px; border:0; vertical-align:middle; }
  .rk-label { width:38%; text-align:start; }
  .rk-track { width:47%; background:#f2f0e8; border-radius:3px; }
  .rk-fill { display:block; height:12px; border-radius:3px; }
  .rk-value { width:15%; text-align:end; font-variant-numeric:tabular-nums; color:${INK}; }
  .donut-wrap { display:flex; gap:24px; align-items:center; flex-wrap:wrap; }
  .legend { list-style:none; padding:0; margin:0; }
  .legend li { margin:3px 0; }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-inline-end:7px; }
`;
