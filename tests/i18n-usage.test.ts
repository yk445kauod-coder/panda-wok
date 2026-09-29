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

function usedKeys(): { key: string; file: string }[] {
  const roots = ["src/app", "src/components"];
  const used: { key: string; file: string }[] = [];
  for (const root of roots) {
    for (const file of filesUnder(root)) {
      const text = readFileSync(file, "utf8");
      // Static string argument only. A template literal with ${...} is skipped.
      const re = /\bt\(\s*"([a-zA-Z0-9_.]+)"\s*[,)]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) used.push({ key: m[1], file });
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
