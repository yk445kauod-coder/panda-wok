/**
 * Pins the rule that keeps the customer site off the 1102 path.
 *
 * Every customer page is a static shell (`[lang]/(site)`). A user-initiated
 * Server Action (a form submit, a button) is a POST the visitor asked for and is
 * fine. The problem is an action invoked *automatically on mount*: the App
 * Router re-runs to re-emit the static document for a page the visitor only
 * opened, and on the Free plan's 10 ms CPU cap that is the request shape that
 * returns Error 1102. The header bell shipped exactly this once
 * (`loadMyNotificationsAction` called from a `useEffect` in `viewer-provider`);
 * it is a plain `GET /api/public/me/notifications` now.
 *
 * This scans the customer shell for an action module imported by a client
 * component that then calls one of its exports inside a `useEffect`. Nothing
 * else catches this: `tsc` and `next build` both pass with the action wired back
 * in.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

/** Every file under a directory, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** True when the file is a `"use server"` module (a Server Action surface). */
function isServerActionModule(file: string): boolean {
  try {
    return /^\s*["']use server["'];/m.test(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

/** The local names a file imports from `@/lib/actions/*` modules. */
function actionBindings(source: string): Map<string, string> {
  const bindings = new Map<string, string>();
  const re = /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/actions\/([^"']+)["']/g;
  for (const match of source.matchAll(re)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) bindings.set(name, `@/lib/actions/${match[2]}`);
    }
  }
  return bindings;
}

/** The body of each `useEffect(() => { ... })` call in a source file. */
function effectBodies(source: string): string[] {
  const bodies: string[] = [];
  const marker = "useEffect(";
  let index = source.indexOf(marker);
  while (index !== -1) {
    // Take a generous window after the call; the invocation we care about is the
    // first statement inside the effect callback.
    bodies.push(source.slice(index, index + 400));
    index = source.indexOf(marker, index + marker.length);
  }
  return bodies;
}

describe("customer shell never fires a Server Action on mount", () => {
  const dirs = [
    join(ROOT, "src", "components", "customer"),
    join(ROOT, "src", "components", "layout"),
  ];

  it("imports no `@/lib/actions/*` binding that is called inside a useEffect", () => {
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
        const source = readFileSync(file, "utf8");
        if (!/^\s*["']use client["'];/m.test(source)) continue;
        const bindings = actionBindings(source);
        if (bindings.size === 0) continue;
        for (const body of effectBodies(source)) {
          for (const [name, module] of bindings) {
            // `name(` inside the effect body means it is invoked on mount.
            if (new RegExp(`\\b${name}\\s*\\(`).test(body)) {
              offenders.push(`${file.replace(ROOT + "/", "")} -> ${name} (${module})`);
            }
          }
        }
      }
    }
    expect(
      offenders,
      "a customer client component calls a Server Action inside useEffect; use a GET route instead",
    ).toEqual([]);
  });

  it("still recognises a Server Action module, so the check is not vacuous", () => {
    expect(isServerActionModule(join(ROOT, "src", "lib", "actions", "notifications.ts"))).toBe(
      true,
    );
  });
});
