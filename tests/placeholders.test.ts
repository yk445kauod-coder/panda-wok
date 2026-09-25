import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { en, type Dictionary } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { makeTranslator } from "@/lib/i18n/translate";

/**
 * A dictionary key with a `{placeholder}` that the call site never supplies
 * renders the braces literally to the user. That is how `home.metaTitle`
 * shipped as the browser-tab title `Panda Wok — {tagline}` on every page that
 * did not set its own title, and how the home identity band printed
 * `Panda Wok · {cuisine} · Alexandria`.
 *
 * These assertions resolve every key with the placeholders its call sites pass
 * and fail if any brace survives.
 */

const PLACEHOLDER = /\{(\w+)\}/g;

function leafValues(node: unknown, prefix = ""): [string, string][] {
  if (typeof node === "string") return [[prefix, node]];
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    leafValues(value, prefix ? `${prefix}.${key}` : key),
  );
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(path) && !path.includes("dictionaries")) out.push(path);
  }
  return out;
}

/** Every `t("key", { ... })` call site, with the placeholder names it supplies. */
function callSites(): Map<string, Set<string>[]> {
  const byKey = new Map<string, Set<string>[]>();
  const root = new URL("../src", import.meta.url).pathname;

  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, "utf8");
    const call = /\bt\(\s*"([\w.]+)"\s*(?:,\s*\{)?/g;
    let match: RegExpExecArray | null;
    while ((match = call.exec(text))) {
      const key = match[1];
      const supplied = new Set<string>();
      const rest = text.slice(match.index + match[0].length);
      if (match[0].endsWith("{")) {
        // Walk to the matching brace so a multi-line object still counts.
        let depth = 1;
        let i = 0;
        for (; i < rest.length && depth > 0; i += 1) {
          if (rest[i] === "{") depth += 1;
          else if (rest[i] === "}") depth -= 1;
        }
        const blob = rest.slice(0, i);
        for (const name of blob.matchAll(/(\w+)\s*:/g)) supplied.add(name[1]);
        // Object shorthand: `{ brand }` supplies `brand`.
        for (const name of blob.matchAll(/(?:^|[{\s,])(\w+)\s*(?=[,}])/g)) {
          supplied.add(name[1]);
        }
      }
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(supplied);
    }
  }
  return byKey;
}

const sites = callSites();

describe("translation placeholders", () => {
  it("resolves without leaving braces when given the call site's placeholders", () => {
    const leaked: string[] = [];

    for (const [locale, dict] of [["en", en], ["ar", ar]] as [string, Dictionary][]) {
      const t = makeTranslator(dict);
      for (const [key, value] of leafValues(dict)) {
        const needed = [...value.matchAll(PLACEHOLDER)].map((m) => m[1]);
        if (needed.length === 0) continue;

        const callers = sites.get(key);
        // Keys reached only through a template literal (`faq.items.${key}.q`)
        // have no static call site, so there is nothing to check here.
        if (!callers || callers.length === 0) continue;
        for (const supplied of callers) {
          // Only the placeholders the call site actually passes; omitting the
          // rest leaves their braces in place, which is what we assert against.
          const args = Object.fromEntries(
            needed.filter((n) => supplied.has(n)).map((n) => [n, "X"]),
          );
          const rendered = t(key as never, args as never);
          if (/\{\w+\}/.test(rendered)) {
            const missing = needed.filter((n) => !supplied.has(n));
            leaked.push(`${locale}:${key} missing ${missing.join(",")}`);
          }
        }
      }
    }

    expect([...new Set(leaked)]).toEqual([]);
  });
});
