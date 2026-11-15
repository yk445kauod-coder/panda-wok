#!/usr/bin/env node
/**
 * Copy the dish photos out of Supabase Storage and into the deployment's R2
 * bucket, then rewrite `menu_items.image_url` to the media-worker URL.
 *
 * Why this exists
 * ---------------
 * Every dish photo is served from `*.supabase.co/storage/v1/object/public/
 * menu-images/...`. On the Free plan that bucket's *cached egress* is the
 * project's scarcest resource: once it is spent, Supabase restricts the whole
 * project — every REST call and every image request answers
 * `402 exceed_cached_egress_quota`, and the site falls back to
 * `dish-placeholder.svg`. The objects themselves are untouched; only the public
 * endpoint is gated. (Verified 2026-11-15: 100 objects, 83 MB, all present, and
 * all 90 menu URLs resolve to one of them.)
 *
 * The durable fix is to stop depending on Supabase egress: enable R2 on the
 * account, create the `panda-wok-media` bucket, uncomment the `r2_buckets`
 * binding in `workers/media-proxy/wrangler.jsonc`, and run this script. After
 * that the media worker serves from R2 (`x-media-source: r2`) and Supabase is
 * not asked for an image again.
 *
 * Prerequisites
 * -------------
 *   SUPABASE_URL                 e.g. https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    the project's service-role key
 *   CLOUDFLARE_API_TOKEN         a token that may write R2 objects
 *   CLOUDFLARE_ACCOUNT_ID        the account holding the bucket
 *   R2_BUCKET                    optional, defaults to `panda-wok-media`
 *
 * The download step needs Storage to be serving again: a 402 cannot be worked
 * around from here, so run this once the quota has reset (or the plan lifted).
 * The script reports how many objects it copied and exits non-zero on any gap,
 * so a partial run is visible rather than silent.
 *
 * Usage:
 *   node scripts/migrate-media-to-r2.mjs            # copy + rewrite URLs
 *   node scripts/migrate-media-to-r2.mjs --dry-run  # report, change nothing
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const R2_BUCKET = process.env.R2_BUCKET ?? "panda-wok-media";
const BUCKET = "menu-images";
const DRY_RUN = process.argv.includes("--dry-run");

/** The exact shape `uploadMenuImageAction` writes, and what the worker accepts. */
const OBJECT_NAME =
  /^dish-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|jpeg|webp|avif)$/i;

function requireEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ACCOUNT_ID) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (!process.env.CLOUDFLARE_API_TOKEN) missing.push("CLOUDFLARE_API_TOKEN");
  if (missing.length > 0) {
    console.error(`Missing required environment: ${missing.join(", ")}`);
    process.exit(2);
  }
}

/** Every object in the bucket, following Storage's pagination. */
async function listObjects() {
  const names = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ prefix: "", limit, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!response.ok) {
      throw new Error(
        `list failed (${response.status}): ${(await response.text()).slice(0, 200)}\n` +
          `A 402 means Storage is still restricted — rerun once the quota resets.`,
      );
    }
    const page = await response.json();
    for (const entry of page) {
      if (entry?.name) names.push(entry.name);
    }
    if (page.length < limit) break;
  }
  return names;
}

async function download(name, dir) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  if (!response.ok) throw new Error(`download ${name} (${response.status})`);
  const path = join(dir, name);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

async function upload(name, path) {
  await run("npx", [
    "wrangler",
    "r2",
    "object",
    "put",
    `${R2_BUCKET}/${name}`,
    `--file=${path}`,
    "--content-type=image/*",
    `--account-id=${ACCOUNT_ID}`,
  ]);
}

/** Rewrite the storage URL on each menu item to the media-worker path. */
async function rewriteUrls(names) {
  const sql = names
    .map(
      (name) =>
        `update public.menu_items set image_url = ` +
        `'https://panda-wok-media.yk445kauod.workers.dev/media/${name}' ` +
        `where image_url like '%/${name}';`,
    )
    .join("\n");
  // Printed rather than run: the URL rewrite belongs in a migration so the change
  // is reviewable and reversible, and this script must not hold DB credentials.
  console.log(
    `\n-- Run this against D1 (the live data store) to point the menu at R2:\n${sql}\n`,
  );
}

async function main() {
  requireEnv();
  const names = (await listObjects()).filter((name) => OBJECT_NAME.test(name));
  console.log(`Found ${names.length} dish objects in ${BUCKET}.`);
  if (names.length === 0) {
    console.error("Nothing to copy — refusing to continue.");
    process.exit(1);
  }
  if (DRY_RUN) {
    console.log("--dry-run: no objects copied.");
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), "panda-media-"));
  const copied = [];
  const failed = [];
  try {
    for (const [index, name] of names.entries()) {
      try {
        const path = await download(name, dir);
        await upload(name, path);
        copied.push(name);
        process.stdout.write(`\r${index + 1}/${names.length} ${name.slice(0, 46)}   `);
      } catch (error) {
        failed.push({ name, error: error instanceof Error ? error.message : String(error) });
      }
    }
    process.stdout.write("\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  console.log(`\nCopied ${copied.length}/${names.length} to R2 bucket ${R2_BUCKET}.`);
  if (failed.length > 0) {
    for (const { name, error } of failed) console.error(`  FAILED ${name}: ${error}`);
    process.exit(1);
  }
  await rewriteUrls(copied);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
