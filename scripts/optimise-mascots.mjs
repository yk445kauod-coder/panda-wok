#!/usr/bin/env node
/**
 * Re-encode the mascot sprite sheets in `public/mascots/`.
 *
 * `page-mascot` paints a 3x3 sheet as a CSS background and steps through it with
 * `background-position`, so the only thing that matters is the per-cell pixel
 * count. The originals are 1080x1080 — 360px per cell — but the mascot renders
 * at 38-52 CSS px, so a 2x display needs ~104 device px per cell. Shipping
 * 360px cells cost 212 KB of image on every page for a 52px circle.
 *
 * Rebuild with `npm run mascots` after replacing a source sheet.
 */
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public/mascots");
/** Per-cell pixels: comfortably above the 52px @2x the mascot renders at. */
const CELL = 160;

for (const name of readdirSync(DIR).filter((f) => f.endsWith(".webp"))) {
  const file = join(DIR, name);
  const before = statSync(file).size;
  const meta = await sharp(file).metadata();

  const buf = await sharp(file)
    .resize(CELL * 3, CELL * 3, { fit: "fill" })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();

  // Guard against a regression where the sheet stops being a 3x3 grid: the
  // component hardcodes 300% background-size and 0/50/100% offsets.
  const out = await sharp(buf).metadata();
  if (out.width !== CELL * 3 || out.height !== CELL * 3) {
    throw new Error(`${name}: expected ${CELL * 3}px square, got ${out.width}x${out.height}`);
  }
  if (before <= buf.length) {
    console.log(`${name}: already lean (${before} bytes), skipped`);
    continue;
  }

  await sharp(buf).toFile(file);
  const after = statSync(file).size;
  console.log(
    `${name}: ${meta.width}x${meta.height} ${before} -> ${out.width}x${out.height} ${after} bytes ` +
      `(${Math.round((1 - after / before) * 100)}% smaller)`,
  );
}
