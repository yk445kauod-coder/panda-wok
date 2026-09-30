import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/ui/markdown";

/**
 * The renderer must never turn model output into executable markup, and must
 * handle the constructs the assistant is told to emit. `renderToStaticMarkup`
 * gives us real React output to assert on without a DOM.
 */
const html = (source: string) => renderToStaticMarkup(<Markdown>{source}</Markdown>);

describe("assistant markdown renderer", () => {
  it("renders bold, lists and headings as real elements", () => {
    const out = html("**Philadelphia Roll** — 410 EGP\n\n- one\n- two\n\n## Heading");
    expect(out).toContain("<strong");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<h4");
  });

  it("groups consecutive bullets into one list", () => {
    const out = html("- a\n- b\n- c");
    expect(out.match(/<ul/g)?.length).toBe(1);
    expect(out.match(/<li/g)?.length).toBe(3);
  });

  it("escapes raw HTML instead of injecting it", () => {
    const out = html("<script>alert(1)</script> and <img src=x onerror=alert(1)>");
    // React escapes both, so no element is produced; the payload survives only
    // as inert text (its angle brackets are entities).
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("refuses javascript: links but keeps http(s) and site paths", () => {
    expect(html("[x](javascript:alert(1))")).not.toContain("href");
    expect(html("[x](https://example.com)")).toContain('href="https://example.com"');
    expect(html("[Menu](/menu)")).toContain('href="/menu"');
  });

  it("renders a markdown table as a real table, not a wall of pipes", () => {
    const out = html("| الصنف | الإيراد |\n| --- | --- |\n| combo | 2040.00 EGP |");
    expect(out).toContain("<table");
    expect(out).toContain("<th");
    expect(out).toContain("<td");
    expect(out).toContain("combo");
    expect(out).not.toContain("| --- |");
  });

  it("renders unterminated emphasis as literal text", () => {
    const out = html("**unclosed bold");
    expect(out).toContain("**unclosed bold");
  });
});
