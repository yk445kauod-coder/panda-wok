import { describe, expect, it } from "vitest";
import { barChart, donutChart, gaugeRows, rankedBarChart, emptyChart } from "@/lib/agent/charts";
import { htmlDocument, escapeHtml, dataTable, kpiGrid, section, slide } from "@/lib/agent/html";

/**
 * Chart and document rendering.
 *
 * These are string builders with no database, so they are cheap to pin and
 * worth pinning: a chart that renders the wrong number, or an unescaped value
 * that breaks the document, is invisible to `tsc` and to the build.
 */
describe("charts", () => {
  it("draws one bar per point and states the real value in a tooltip", () => {
    const svg = barChart([
      { label: "Mon", value: 100 },
      { label: "Tue", value: 250 },
    ]);
    expect(svg.match(/<rect /g)).toHaveLength(2);
    expect(svg).toContain("Mon: 100");
    expect(svg).toContain("Tue: 250");
  });

  it("renders a zero value as no visible bar, not a sliver", () => {
    // A 2px bar on a zero day reads as a sale that did not happen.
    const svg = barChart([{ label: "Mon", value: 0 }]);
    expect(svg).toContain('height="0.0"');
  });

  it("uses an empty state rather than inventing an axis when there is no data", () => {
    expect(barChart([])).toContain("chart-empty");
    expect(donutChart([])).toContain("chart-empty");
    expect(rankedBarChart([])).toContain("chart-empty");
    expect(donutChart([{ label: "a", value: 0 }])).toContain("chart-empty");
  });

  it("computes donut shares from the values and shows the raw figure too", () => {
    const svg = donutChart(
      [
        { label: "finished", value: 75 },
        { label: "canceled", value: 25 },
      ],
      { valueFormat: (n) => String(n) },
    );
    expect(svg).toContain("75.0%");
    expect(svg).toContain("25.0%");
    // The count must appear beside the share, not only the arc width.
    expect(svg).toContain("finished");
  });

  it("escapes labels so a dish name cannot break the document", () => {
    const svg = barChart([{ label: `<script>&"x`, value: 1 }]);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("renders gauge rows and a readable empty message", () => {
    expect(gaugeRows([{ label: "repeat", value: 1 }])).toContain("rk-fill");
    expect(emptyChart("nothing")).toContain("nothing");
  });
});

describe("html document shell", () => {
  it("is self-contained: no external script, font or stylesheet", () => {
    const doc = htmlDocument({
      title: "T",
      dir: "rtl",
      generatedAt: "2026-01-01",
      sections: section("S", "body"),
    });
    expect(doc).toContain("<style>");
    expect(doc).not.toContain("<script");
    expect(doc).not.toContain("http://");
    expect(doc).not.toContain("https://");
    expect(doc).not.toMatch(/<link[^>]+stylesheet/);
  });

  it("sets the document direction for Arabic", () => {
    const rtl = htmlDocument({ title: "T", dir: "rtl", generatedAt: "x", sections: "" });
    expect(rtl).toContain('dir="rtl"');
    expect(rtl).toContain('lang="ar"');
    const ltr = htmlDocument({ title: "T", generatedAt: "x", sections: "" });
    expect(ltr).toContain('dir="ltr"');
  });

  it("declares print rules so a deck exports to PDF as pages", () => {
    const doc = htmlDocument({ title: "T", generatedAt: "x", sections: slide("One", "body") });
    expect(doc).toContain("@media print");
    expect(doc).toContain("page-break-after");
  });

  it("escapes every dynamic string in the helpers", () => {
    expect(escapeHtml(`<b>"&'`)).toBe("&lt;b&gt;&quot;&amp;&#39;");
    expect(kpiGrid([{ label: "<b>", value: "<i>" }])).not.toContain("<b>");
    expect(
      dataTable([{ key: "a", label: "<x>" }], [{ a: "<script>" }]),
    ).not.toContain("<script>");
  });

  it("says so when a table has no rows instead of rendering a header only", () => {
    expect(dataTable([{ key: "a", label: "A" }], [], { empty: "لا توجد بيانات" })).toContain(
      "لا توجد بيانات",
    );
  });
});
