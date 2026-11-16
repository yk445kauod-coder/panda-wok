import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { consoleEn } from "@/lib/i18n/dictionaries/console-en";
import { consoleAr } from "@/lib/i18n/dictionaries/console-ar";

function keysOf(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    keysOf(value, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * The console ships only the blocks it renders (`console-en` / `console-ar`),
 * and the full dictionary spreads them back in so, the keys have one source.
 * That split only stays honest if the slice is exactly the console's own blocks
 * and nothing more — one storefront block drifting in would put storefront copy
 * back on every console page load, which is the weight this split removed.
 */
describe("console dictionary slice", () => {
  const SLICE = ["common", "errors", "kds", "admin"];

  it("carries the console blocks and no storefront block", () => {
    expect(Object.keys(consoleEn).sort()).toEqual([...SLICE].sort());
    expect(Object.keys(consoleAr).sort()).toEqual([...SLICE].sort());
  });

  it("is byte-identical to the same keys in the full dictionary", () => {
    for (const key of SLICE) {
      expect(consoleEn[key as keyof typeof consoleEn]).toEqual(
        (en as Record<string, unknown>)[key],
      );
      expect(consoleAr[key as keyof typeof consoleAr]).toEqual(
        (ar as Record<string, unknown>)[key],
      );
    }
  });

  it("covers every key the console resolves", () => {
    const inSlice = new Set(keysOf(consoleEn));
    // A console key that lives outside the slice would echo its dotted path at
    // runtime instead of translating, because the console renders the slice and
    // not the full dictionary.
    const consoleKeys = keysOf(en).filter(
      (k) => k.startsWith("admin.") || k.startsWith("kds."),
    );
    expect(consoleKeys.filter((k) => !inSlice.has(k))).toEqual([]);
  });
});
