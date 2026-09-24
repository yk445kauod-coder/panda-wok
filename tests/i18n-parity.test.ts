import { describe, expect, it } from "vitest";
import { en, type Dictionary } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { makeTranslator } from "@/lib/i18n/translate";

function keysOf(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    keysOf(value, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * `ar` is typed as `Dictionary`, so a missing key is normally a build error.
 * This asserts the same at test time, and additionally that no key exists in
 * Arabic only — a translation with no English source is unreachable copy.
 */
describe("dictionary parity", () => {
  const enKeys = keysOf(en).sort();
  const arKeys = keysOf(ar).sort();

  it("has no key missing from Arabic", () => {
    expect(enKeys.filter((key) => !arKeys.includes(key))).toEqual([]);
  });

  it("has no orphaned Arabic key", () => {
    expect(arKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it("keeps the FAQ question and answer pairs complete in both locales", () => {
    const faqKeys = enKeys.filter(
      (key) => key.startsWith("faq.items.") && (key.endsWith(".q") || key.endsWith(".a")),
    );
    expect(faqKeys.length).toBeGreaterThan(0);

    for (const locale of [en, ar] as Dictionary[]) {
      for (const key of faqKeys) {
        const t = makeTranslator(locale);
        const value = t(key);
        expect(value, `${key} resolved to its own key`).not.toBe(key);
        expect(value.length).toBeGreaterThan(3);
      }
    }
  });

  it("fills every placeholder the FAQ answers reference", () => {
    const vars = {
      brand: "Panda Wok",
      city: "Alexandria",
      country: "Egypt",
      currency: "EGP",
      cuisine: "Asian cuisine",
      minOrder: "80 EGP",
      fee: "25 EGP",
      freeOver: "250 EGP",
      minutes: "40",
    };

    for (const locale of [en, ar] as Dictionary[]) {
      const t = makeTranslator(locale);
      for (const key of keysOf(locale).filter((k) => k.startsWith("faq.items."))) {
        const rendered = t(key, vars);
        expect(rendered).not.toMatch(/\{[a-zA-Z_]+\}/);
        expect(rendered).not.toContain("undefined");
      }
    }
  });

  it("leaves an unknown placeholder visible rather than blanking it", () => {
    const t = makeTranslator(en);
    expect(t("faq.items.where.a", { brand: "Panda Wok" })).toContain("{city}");
  });
});
