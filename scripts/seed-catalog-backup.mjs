/**
 * Loads the last known-good public catalogue into the KV backup keys.
 *
 * The storefront keeps a backup of every public read (see
 * `src/lib/cache/catalog-backup.ts`) so a Supabase outage — a spent egress
 * quota, a paused project — shows the menu instead of a 500. That backup only
 * fills up from successful reads, which is no help on the day the outage starts
 * with a cold KV. This seeds it from `scripts/seed/catalog-backup.json`, which
 * was extracted from a build whose pages had all rendered against a healthy
 * Supabase.
 *
 * Safe to re-run: it writes the same keys with the same values.
 *
 * Usage: node scripts/seed-catalog-backup.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAMESPACE = "9275068b465c4518b64ad36e24b876b5";
const PREFIX = "catalog-backup:";

const seed = JSON.parse(
  readFileSync(join(ROOT, "scripts", "seed", "catalog-backup.json"), "utf8"),
);

const wrangler = join(ROOT, "node_modules", ".bin", "wrangler");

for (const [name, entry] of Object.entries(seed)) {
  // `at: 0` marks a seeded copy: the first real read replaces it, and until
  // then the fallback is served even though it is not six hours old.
  const value = JSON.stringify({ at: entry.at ?? 0, value: entry.value });
  const key = `${PREFIX}${name}`;
  try {
    execFileSync(
      wrangler,
      ["kv", "key", "put", `--namespace-id=${NAMESPACE}`, key, value],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    console.log(`seeded ${key} (${value.length} bytes)`);
  } catch (error) {
    console.error(`FAILED ${key}: ${error.stderr?.toString?.() ?? error.message}`);
    process.exitCode = 1;
  }
}
