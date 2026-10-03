import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The customer "All pages" sheet was unusable on a phone, for two independent
 * reasons — and neither was visible to `tsc` or lint.
 *
 * 1. **Dark-on-dark text.** It was a `glass-bar` (dark lacquer) panel whose own
 *    rule sets cream text, but it was filled with `text-ink-900` / `text-ink-700`
 *    — the *light*-surface palette. Measured **1.00:1** on the live site: an
 *    apparently empty sheet. It is now a `washi-paper` (cream) panel with ink
 *    text, matching the header: measured **17.1:1**.
 *
 * 2. **Positioned off-screen.** Rendered inline it sat inside the sticky
 *    `washi-paper` header, which runs the `washi-sway` animation. An animated
 *    `transform` makes that header the containing block for `position: fixed`,
 *    so the sheet was laid out against a 4rem box and landed at **y=-429** —
 *    above the viewport. It is now portalled to `document.body`.
 *
 * These tests pin the invariants that prevent both regressions.
 */

const SOURCE = readFileSync("src/components/layout/mobile-nav.tsx", "utf8");

describe("customer mobile nav sheet", () => {
  it("uses the light washi surface, matching the header", () => {
    expect(SOURCE).toMatch(/role="dialog"[\s\S]{0,200}washi-paper/);
  });

  it("never paints ink-on-glass: the sheet body uses no glass-bar", () => {
    // `glass-bar` is the dark surface; the sheet's own rule is washi-paper now.
    const dialogStart = SOURCE.indexOf('role="dialog"');
    const dialog = SOURCE.slice(dialogStart, SOURCE.indexOf("</div>,", dialogStart));
    expect(dialog).not.toMatch(/glass-bar/);
  });

  it("portals the overlay to <body> so no transformed ancestor can trap it", () => {
    // The header's `washi-sway` animates `transform`, which would otherwise
    // become the containing block for the fixed overlay.
    expect(SOURCE).toMatch(/createPortal\(/);
    expect(SOURCE).toMatch(/document\.body,\s*\)/);
  });

  it("waits for a client click before rendering the portal (no SSR mismatch)", () => {
    // The sheet is opened by a click, so `document` always exists here; a
    // mounted flag would be setState-in-effect, which the lint rule forbids.
    expect(SOURCE).toMatch(/\{open\s*\n?\s*\? createPortal\(/);
  });
});

