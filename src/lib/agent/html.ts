import "server-only";

import { CHART_CSS } from "@/lib/agent/charts";

/**
 * The shell every HTML deliverable is wrapped in.
 *
 * Self-contained on purpose: inline CSS, no external font, no script, no image
 * request. A filed artifact gets opened from a downloads folder, forwarded by
 * email and printed, so it must render identically with no network. The layout
 * is RTL-aware (`dir` is a parameter) because the console is Arabic-first and
 * the agent's prose is Egyptian Arabic.
 *
 * Print rules matter as much as screen: the agent's deck is meant to be
 * presented and exported to PDF, so page breaks and background colours are
 * declared rather than left to the browser's defaults.
 */
export function htmlDocument(params: {
  title: string;
  dir?: "rtl" | "ltr";
  generatedAt: string;
  sections: string;
  footer?: string;
}): string {
  const dir = params.dir ?? "ltr";
  return `<!doctype html>
<html lang="${dir === "rtl" ? "ar" : "en"}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(params.title)}</title>
<style>
  :root { --ink:${"#1c2a24"}; --muted:#6b7b74; --line:#e2e0d6; --accent:#2f6f52; }
  * { box-sizing:border-box; }
  body { margin:0; padding:32px 24px; background:#fbfaf6; color:var(--ink);
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
         line-height:1.6; }
  .sheet { max-width:960px; margin:0 auto; background:#fff; border:1px solid var(--line);
           border-radius:10px; padding:32px 36px; }
  header.doc-head { border-bottom:2px solid var(--accent); padding-bottom:14px; margin-bottom:22px; }
  h1 { font-size:26px; margin:0 0 6px; }
  h2 { font-size:19px; margin:30px 0 10px; padding-top:6px; border-top:1px solid var(--line); }
  h2:first-of-type { border-top:0; padding-top:0; }
  h3 { font-size:15px; margin:20px 0 8px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
  .meta { color:var(--muted); font-size:13px; }
  table { width:100%; border-collapse:collapse; margin:10px 0 18px; font-size:14px; }
  th, td { border:1px solid var(--line); padding:7px 10px; text-align:start; }
  th { background:#f5f3ea; font-weight:600; }
  td.num, th.num { text-align:end; font-variant-numeric:tabular-nums; }
  .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin:16px 0 8px; }
  .kpi { border:1px solid var(--line); border-radius:8px; padding:12px 14px; background:#fbfaf6; }
  .kpi .label { font-size:12px; color:var(--muted); }
  .kpi .value { font-size:22px; font-weight:600; font-variant-numeric:tabular-nums; }
  .note { background:#f7f5ec; border-inline-start:4px solid var(--accent); padding:10px 14px; margin:14px 0; font-size:14px; }
  .warn { border-inline-start-color:#b4632a; }
  footer.doc-foot { margin-top:28px; padding-top:12px; border-top:1px solid var(--line);
                    color:var(--muted); font-size:12px; }
  ${CHART_CSS}
  .slide { page-break-after:always; border:1px solid var(--line); border-radius:10px;
           padding:26px 30px; margin:0 0 22px; min-height:360px; background:#fff; }
  .slide:last-child { page-break-after:auto; }
  .slide h2 { border-top:0; margin-top:0; }
  @media print {
    body { background:#fff; padding:0; }
    .sheet { border:0; border-radius:0; padding:0; max-width:none; }
    .slide { border:0; min-height:auto; }
    .kpi, .note { background:#fff; }
    th { background:#f5f3ea !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    svg { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="sheet">
  <header class="doc-head">
    <h1>${escapeHtml(params.title)}</h1>
    <p class="meta">Panda Wok · generated ${escapeHtml(params.generatedAt)} · all figures from the live database</p>
  </header>
${params.sections}
  <footer class="doc-foot">${params.footer ?? "Read-only snapshot. Nothing in this document changes an order, a price or the menu."}</footer>
</div>
</body>
</html>`;
}

/** Escapes text for HTML. Every dynamic string in a deliverable goes through this. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A KPI tile row. `value` is pre-formatted by the caller so units stay explicit. */
export function kpiGrid(items: { label: string; value: string }[]): string {
  return `<div class="kpis">${items
    .map(
      (i) =>
        `<div class="kpi"><div class="label">${escapeHtml(i.label)}</div><div class="value">${escapeHtml(i.value)}</div></div>`,
    )
    .join("")}</div>`;
}

/** A data table. Numbers are right-aligned by convention. */
export function dataTable(
  columns: { key: string; label: string; numeric?: boolean }[],
  rows: Record<string, string | number>[],
  opts: { empty?: string } = {},
): string {
  if (rows.length === 0) return `<p class="chart-empty">${escapeHtml(opts.empty ?? "No rows.")}</p>`;
  return `<table>
    <thead><tr>${columns.map((c) => `<th${c.numeric ? ' class="num"' : ""}>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map(
        (r) =>
          `<tr>${columns
            .map((c) => `<td${c.numeric ? ' class="num"' : ""}>${escapeHtml(String(r[c.key] ?? ""))}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

/** A callout. `tone: "warn"` is for something the reader must act on. */
export function note(text: string, tone: "info" | "warn" = "info"): string {
  return `<div class="note${tone === "warn" ? " warn" : ""}">${escapeHtml(text)}</div>`;
}

export function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

export function slide(title: string, body: string): string {
  return `<section class="slide"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}
