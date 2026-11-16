/**
 * Pins the middleware's import graph against the 1102 regression.
 *
 * The middleware runs on every request, and on the Workers Free plan a request
 * has 10 ms of CPU. `config/env.ts` validates the environment with zod, so a
 * single import of it from anything reachable by the middleware ships the whole
 * validator (~450 KB) and pushes the request over the cap. That regression
 * shipped once already and was fixed by moving the public values into
 * `public-env.ts`; the D1 work added two more modules to the middleware's graph
 * (`d1-session.ts` and `d1/backend.ts`), so this test exists to keep them honest.
 *
 * It walks the real import graph from `src/middleware.ts` rather than grepping
 * one file, because the danger is an *indirect* import three modules deep.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

/** Resolves an import specifier from a file to a source path, or null. */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith("@/")) base = join(ROOT, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  if (!base) return null;

  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*import\s[^;]*?from\s+["']([^"']+)["']/g;

/** Every source file reachable from `entry` through static imports. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(IMPORT_RE)) {
      const next = resolveImport(file, match[1]);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

describe("middleware import graph", () => {
  const graph = reachable(join(ROOT, "src/middleware.ts"));

  it("never reaches the zod-validated server config", () => {
    const forbidden = [...graph].filter((f) => f.endsWith(join("config", "env.ts")));
    expect(
      forbidden,
      "the middleware graph imports config/env.ts, which ships zod on every request",
    ).toEqual([]);
  });

  it("never reaches the service-role client", () => {
    const forbidden = [...graph].filter((f) => f.endsWith(join("supabase", "service.ts")));
    expect(forbidden, "the middleware must not import the service-role client").toEqual([]);
  });

  it("still reaches the D1 session verifier, so the check is not vacuous", () => {
    // If the walker broke, the two tests above would pass by finding nothing.
    const session = [...graph].filter((f) => f.endsWith(join("auth", "d1-session.ts")));
    expect(session.length).toBe(1);
  });

  it("only imports @supabase/ssr dynamically", () => {
    // `@supabase/ssr` drags auth-js and realtime-js into the middleware bundle.
    // It is imported with `await import(...)` inside `supabase/middleware.ts`,
    // so on a D1 deployment — the only place this project runs — the client is
    // never constructed. Measured caveat: Turbopack still inlines the code into
    // the handler chunk, so this guards against a *static* import reappearing
    // (which would construct it on the module path) rather than against bundle
    // size, which the split does not actually change here.
    const reachableStatic = [...graph];
    for (const file of reachableStatic) {
      const source = readFileSync(file, "utf8");
      expect(
        /^\s*import\s[^;]*from\s+["']@supabase\/ssr["']/m.test(source),
        `${file} statically imports @supabase/ssr`,
      ).toBe(false);
    }
  });
});
