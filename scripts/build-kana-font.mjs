#!/usr/bin/env node
/**
 * Rebuild `public/fonts/kana-mark.woff2` — the CJK script mark face.
 *
 * The site's only CJK copy is `BRAND_SCRIPT_MARK` in src/lib/brand.ts. Google
 * serves Shippori Mincho as ~244 unicode-range subsets, and the two glyphs in
 * 中華 do not even live in the same one. Loading it through `next/font` emits
 * an @font-face for every chunk (189 KB of CSS) whether or not a page renders
 * a single glyph.
 *
 * This script fetches the Google CSS, downloads the subset files that actually
 * carry the mark's codepoints, merges them, trims to those codepoints and emits
 * a single ~1 KB woff2. Run it when the mark changes.
 *
 * Usage: npm run fonts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/fonts/kana-mark.woff2");
const TMP = join(ROOT, ".fonts-tmp");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Codepoints that must survive into the subset, read from the brand constant. */
function brandCodepoints() {
  const source = readFileSync(join(ROOT, "src/lib/brand.ts"), "utf8");
  const match = source.match(/BRAND_SCRIPT_MARK\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("BRAND_SCRIPT_MARK not found in src/lib/brand.ts");
  const mark = match[1];
  const extra = ["\u00b7", " "]; // separator / space kept so tracking works
  return [...new Set([...mark, ...extra])].map((ch) => ch.codePointAt(0));
}

async function main() {
  const codepoints = brandCodepoints();
  const unicodes = codepoints.map((c) => "U+" + c.toString(16).toUpperCase());
  console.log(`Brand mark codepoints: ${unicodes.join(", ")}`);

  const cssUrl =
    "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600&display=swap";
  const css = await (await fetch(cssUrl, { headers: { "User-Agent": UA } })).text();

  // Pair each @font-face block's unicode-range with its file URL, so we only
  // download the handful of chunks that actually carry the mark.
  const blocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const wanted = new Set(codepoints);
  const picks = [];
  for (const block of blocks) {
    const range = block.match(/unicode-range:\s*([^;}]+)/)?.[1];
    const url = block.match(/url\((https:[^)]+)\)/)?.[1];
    if (!range || !url) continue;
    const covered = new Set();
    for (const part of range.split(",")) {
      const t = part.trim().replace(/^u\+/i, "");
      if (!t) continue;
      if (t.includes("-")) {
        const [a, b] = t.split("-").map((x) => parseInt(x, 16));
        for (let c = a; c <= b; c++) covered.add(c);
      } else {
        covered.add(parseInt(t, 16));
      }
    }
    if ([...wanted].some((c) => covered.has(c))) picks.push(url);
  }
  if (picks.length === 0) throw new Error("No Shippori Mincho subset covers the mark");

  mkdirSync(TMP, { recursive: true });
  const files = [];
  for (const [i, url] of picks.entries()) {
    const dest = join(TMP, `chunk-${i}.woff2`);
    if (!existsSync(dest)) {
      const buf = Buffer.from(await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer());
      writeFileSync(dest, buf);
    }
    files.push(dest);
  }
  console.log(`Downloaded ${files.length} source chunk(s).`);

  const merged = join(TMP, "merged.ttf");
  execFileSync("python3", ["-c", MERGE_PY, ...files, merged], { stdio: "inherit" });

  mkdirSync(dirname(OUT), { recursive: true });
  execFileSync("pyftsubset", [
    merged,
    `--unicodes=${unicodes.join(",")}`,
    "--flavor=woff2",
    `--output-file=${OUT}`,
    "--layout-features=",
    "--no-hinting",
    "--desubroutinize",
    "--drop-tables+=GSUB,GPOS,GDEF",
  ]);

  const { size } = await import("node:fs").then((fs) => fs.statSync(OUT));
  console.log(`Wrote ${OUT} (${size} bytes)`);
}

/** Merge via fontTools — pyftsubset cannot combine two source files itself. */
const MERGE_PY = `
import sys
from fontTools.merge import Merger
Merger().merge(sys.argv[1:-1]).save(sys.argv[-1])
`;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
