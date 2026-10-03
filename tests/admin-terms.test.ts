import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { en } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";

const ROOT = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/** Every `admin.term.<group>.<token>` key the dictionaries define. */
function termKeys(dict: unknown): Set<string> {
  const admin = (dict as { admin?: { term?: Record<string, unknown> } }).admin;
  const keys = new Set<string>();
  for (const [group, value] of Object.entries(admin?.term ?? {})) {
    if (value && typeof value === "object") {
      for (const token of Object.keys(value)) keys.add(`admin.term.${group}.${token}`);
    }
  }
  return keys;
}

/**
 * `t("admin.term.feedbackStatus.new")` is a plain string lookup, so `tsc` cannot
 * see a token that the dictionary does not define — the page just renders the
 * raw key path. These tests close that gap for the enum-token namespaces, which
 * are the ones fed straight from database values.
 */
describe("admin enum-token translations", () => {
  it("defines every feedback status and category the schema allows", () => {
    const statuses = ["new", "reviewed", "responded", "resolved", "archived"];
    const categories = ["food_quality", "delivery", "service", "overall", "other"];
    for (const status of statuses) {
      expect(en.admin.term.feedbackStatus[status as "new"]).toBeTruthy();
      expect(ar.admin.term.feedbackStatus[status as "new"]).toBeTruthy();
    }
    for (const category of categories) {
      expect(en.admin.term.feedbackCategory[category as "other"]).toBeTruthy();
      expect(ar.admin.term.feedbackCategory[category as "other"]).toBeTruthy();
    }
  });

  it("keeps the English and Arabic term namespaces in step", () => {
    const enKeys = termKeys(en);
    const arKeys = termKeys(ar);
    expect([...enKeys].sort()).toEqual([...arKeys].sort());
  });

  it("does not leave a stale enum token in the dictionary", () => {
    // `open` / `closed` / `replied` belonged to a pre-migration enum and are no
    // longer values the database can hold.
    for (const stale of ["open", "closed", "replied"]) {
      expect(en.admin.term.feedbackStatus[stale as "new"]).toBeUndefined();
    }
  });

  it("never renders a term key that the dictionary does not define", () => {
    const known = new Set([...termKeys(en)].map((key) => key.replace("admin.term.", "")));
    const sources = walk(join(ROOT, "src"));
    const offenders: string[] = [];

    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/admin\.term\.([A-Za-z]+)\.([A-Za-z_]+)/g)) {
        const key = `${match[1]}.${match[2]}`;
        // A template literal segment (`admin.term.role.${role}`) is dynamic; the
        // second capture stops at the `$`, so only the literal part is checked.
        if (!known.has(key) && !match[2].startsWith("$")) {
          offenders.push(`${file}: admin.term.${key}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
