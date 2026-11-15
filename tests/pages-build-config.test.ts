/**
 * Pins the Pages assembly so the icon routes cannot silently drift back onto
 * the Worker.
 *
 * Next serves `src/app/icon.svg`, `apple-icon.png` and `favicon.ico` as
 * *routes*, not static assets, so `_routes.json` alone cannot keep them off the
 * Worker — the file has to be copied into the assets root first. On 2026-11-13
 * `/icon.svg` 504'd 377 times (a 77 KB SVG built at request time against the
 * Free plan's 10 ms CPU cap) and `/apple-icon.png` 154 times, and every browser
 * fetches the tab icon on every visit. These assertions fail if the copy or the
 * exclusion is dropped.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const build = readFileSync(resolve(ROOT, "scripts/build-pages.mjs"), "utf8");
const headers = readFileSync(resolve(ROOT, "public/_headers"), "utf8");

describe("pages build config", () => {
  it("copies the Next metadata icons into the assets root", () => {
    for (const icon of ["icon.svg", "apple-icon.png", "favicon.ico"]) {
      expect(build, icon).toContain(`"${icon}"`);
    }
    // The copy must read from the app dir, where the route handlers live.
    expect(build).toContain('path.join(root, "src", "app", icon)');
  });

  it("excludes the icon routes from the Worker", () => {
    for (const route of ["/icon.svg", "/apple-icon.png", "/favicon.ico"]) {
      expect(build, route).toContain(`"${route}"`);
    }
  });

  it("serves SVGs with a long cache lifetime", () => {
    // Without a rule the assets fall to the default `must-revalidate`, so the
    // browser re-fetches the tab icon on every navigation.
    expect(headers).toMatch(/\/\*\.svg\s*\n\s*Cache-Control: public, max-age=86400/);
  });

  it("ships the icon sources the copy depends on", () => {
    for (const icon of ["icon.svg", "apple-icon.png"]) {
      expect(existsSync(resolve(ROOT, "src/app", icon)), icon).toBe(true);
    }
  });
});
