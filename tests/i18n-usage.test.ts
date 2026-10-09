import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { en } from "@/lib/i18n/dictionaries/en";

/**
 * Every literal `t("some.key")` must resolve to a real dictionary key.
 *
 * `tsc` cannot catch this: the dictionary is one object and the lookup accepts
 * any string, so a call site naming a key that was never added renders the raw
 * key path to the visitor ("contact.faqHeading") and only at runtime. That is a
 * silent, deploy-time-only break — the contact page shipped with two of them.
 *
 * Dynamic keys (`t(`admin.nav.${x}`)`) are skipped: they cannot be checked
 * statically, and the family they belong to is asserted separately below.
 */

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) filesUnder(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function keysOf(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    keysOf(value, prefix ? `${prefix}.${key}` : key),
  );
}

const DICTIONARY_KEYS = new Set(keysOf(en));

const ROOTS = ["src/app", "src/components"];

/** Top-level dictionary members; a bare string starting with one of these is a key. */
const TOP_LEVEL = new Set(Object.keys(en));

function usedKeys(): { key: string; file: string }[] {
  const used: { key: string; file: string }[] = [];
  for (const root of ROOTS) {
    for (const file of filesUnder(root)) {
      const text = readFileSync(file, "utf8");

      // `t("some.key")` — static string argument only; a template literal with
      // ${...} is skipped because it cannot be checked statically.
      const callRe = /\bt\(\s*"([a-zA-Z0-9_.]+)"\s*[,)]/g;
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(text))) used.push({ key: m[1], file });

      // Keys parked in constants (`labelKey: "admin.pages.x.inApp"`) are never
      // passed to t() literally, so the scan above cannot see them. That blind
      // spot once shipped a family pointing at the wrong level of the
      // dictionary — the label rendered as a raw key path.
      //
      // The discriminator is depth: real keys are three segments or deeper
      // (`admin.pages.broadcast.composer.inApp`), while the dotted literals
      // that are not keys are two-segment capabilities such as `orders.view`
      // and `menu.manage`. Requiring the first segment to be a top-level
      // dictionary member keeps route strings out too.
      const literalRe = /"([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){2,})"/g;
      while ((m = literalRe.exec(text))) {
        if (TOP_LEVEL.has(m[1].split(".")[0])) used.push({ key: m[1], file });
      }
    }
  }
  return used;
}

describe("dictionary usage", () => {
  it("only references keys that exist in the dictionary", () => {
    const missing = usedKeys()
      .filter(({ key }) => !DICTIONARY_KEYS.has(key))
      .map(({ key, file }) => `${file.replace(/^src\//, "")} → ${key}`);
    expect([...new Set(missing)]).toEqual([]);
  });

  it("keeps the admin nav key families complete so dynamic lookups never blank", () => {
    // `admin.nav.*` and `admin.group.*` are looked up dynamically from rbac.ts,
    // so a missing member is invisible to the static scan above.
    const navFamilies = [...DICTIONARY_KEYS].filter(
      (k) => k.startsWith("admin.nav.") || k.startsWith("admin.group."),
    );
    expect(navFamilies.length).toBeGreaterThan(20);
  });
});
