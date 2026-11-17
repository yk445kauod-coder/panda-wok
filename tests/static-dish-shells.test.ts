/**
 * Pins the static-shell path that keeps dish pages off the CPU ceiling.
 *
 * `/[lang]/menu/[slug]` used to be a cold Next render on a cache miss:
 * OpenNext read and JSON-parsed a ~500 KB incremental-cache entry (the Arabic
 * ones are the largest, because every Arabic character is two UTF-8 bytes) and
 * rebuilt the App Router tree. On the Workers Free plan's 10 ms CPU cap that
 * returned Error 1102 — observed live as `ar /menu/<slug>` 500/503 while the
 * English pages squeaked through, 72 dish paths failing in one CI warm run.
 *
 * The fix ships each dish shell as a static `.html` file and serves it straight
 * from `ASSETS`. These assertions fail if that wiring is dropped, because a
 * silent revert puts the 1102 back on the busiest pages.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const build = readFileSync(resolve(ROOT, "scripts/build-pages.mjs"), "utf8");
const worker = readFileSync(resolve(ROOT, "scripts/pages/_worker.js"), "utf8");

describe("static dish shells", () => {
  it("extracts dish shells from the prerendered cache at build time", () => {
    // Only `/menu/<slug>` is written as a file; the pattern is the whole guard.
    expect(build).toContain("writeStaticShells");
    expect(build).toMatch(/\^\\\/\(\?:en\|ar\)\\\/menu\\\/\[\^\/\]\+\$/);
  });

  it("serves a shell from ASSETS before calling Next", () => {
    // The shell lookup must exist, and it must be wired into the origin render
    // so a cache MISS also skips the Next render.
    expect(worker).toContain("renderOrigin");
    expect(worker).toMatch(/ASSETS\.fetch\(/);
    expect(worker).toContain(".html");
  });

  it("never serves a shell to a signed-in or non-document request", () => {
    // A session cookie, RSC, prefetch, Authorization and a markdown-for-agents
    // accept all fall through to Next, so those variants keep behaving.
    expect(worker).toContain("hasRscHeader");
    expect(worker).toContain("hasPrefetchHeader");
    expect(worker).toContain("hasAuthorization");
    expect(worker).toMatch(/cookieNames\.length === 0/);
    expect(worker).toMatch(/text\/markdown/);
  });

  it("keeps the document security headers on a static shell", () => {
    // The shell is returned before the middleware runs, so the CSP and frame
    // protections would be missing without this.
    expect(worker).toContain("applyDocumentHeaders");
    expect(worker).toContain("frame-ancestors 'none'");
  });

  it("no longer walks every dish URL in the warm step", () => {
    const warm = readFileSync(resolve(ROOT, "scripts/warm-edge-cache.mjs"), "utf8");
    // The slow, flaky dish walk is gone; the pages are static now.
    expect(warm).not.toContain("dishSlugs");
    expect(warm).not.toContain("DISH_WARM_LIMIT");
  });
});
