import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A text field that takes its colour from an ancestor is invisible wherever
 * that ancestor is the dark page ground.
 *
 * The customer shell sets cream text for the ink ground; a field styled only
 * `bg-rice-50` therefore inherits cream and renders cream-on-cream (1.07:1) —
 * literally blank. This shipped in three places: the `/admin` passcode field,
 * ~400 admin controls, and the customer AI assistant's message box. None of
 * them were visible to `tsc` or lint; they were only found by measuring the
 * rendered page.
 *
 * The structural fix is one base rule in `globals.css` that states the
 * light-surface assumption for every field, so a new field cannot silently
 * inherit the dark ground's colour. These tests pin that rule and the two
 * fields that must not depend on it (the assistant panel and the admin gate
 * render outside the surfaces the rule's siblings assume).
 */

const css = readFileSync("src/app/globals.css", "utf8");

describe("text fields state their colour", () => {
  it("globals.css colours input, textarea and select explicitly", () => {
    // A base rule, not a utility: it has to reach a field with no class at all.
    expect(css).toMatch(
      /input:not\(\[type="checkbox"\]\)[^{]*,\s*textarea,\s*select\s*\{\s*color:\s*var\(--color-ink-900\)/s,
    );
  });

  it("globals.css colours placeholders explicitly", () => {
    expect(css).toMatch(/input::placeholder,\s*textarea::placeholder\s*\{/s);
  });

  it("the customer assistant input states it in its own class too", () => {
    const source = readFileSync("src/components/panda/assistant.tsx", "utf8");
    const classes = source.match(/className="h-11 flex-1[^"]*"/)?.[0];
    expect(classes, "assistant input class not found").toBeTruthy();
    expect(classes).toMatch(/text-ink-900/);
  });

  it("the admin gate passcode field states it in its own class too", () => {
    const source = readFileSync("src/components/admin/admin-gate-form.tsx", "utf8");
    expect(source).toMatch(/text-ink-900/);
  });
});
