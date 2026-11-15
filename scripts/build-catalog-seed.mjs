/**
 * Regenerates `src/lib/cache/seed/catalog-backup.ts` from the JSON the KV seeder
 * reads, so the two can never disagree.
 *
 * Usage: node scripts/build-catalog-seed.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(
  readFileSync(join(ROOT, "scripts", "seed", "catalog-backup.json"), "utf8"),
);

const header = `/**
 * Last known-good public reads, captured from a deployment that rendered against
 * a healthy Supabase, and committed so the storefront survives an outage.
 *
 * This file is generated — do not edit by hand. Regenerate with:
 *   node scripts/build-catalog-seed.mjs
 *
 * It is deliberately a TypeScript module rather than JSON: a JSON import's shape
 * (the object, or an object wrapped in \`default\`) depends on the bundler, and
 * getting it wrong disables the fallback silently, surfacing only as a build
 * that fails on the day Supabase is unreachable.
 */
export type StoredBackup = { at: number; value: unknown };

export const catalogSeed: Record<string, StoredBackup> = `;

writeFileSync(
  join(ROOT, "src", "lib", "cache", "seed", "catalog-backup.ts"),
  header + JSON.stringify(source) + ";\n",
);
console.log(`wrote ${Object.keys(source).length} entries`);
