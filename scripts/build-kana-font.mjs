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
const BRAND = join(ROOT, "src/lib/brand.ts");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Codepoints that must survive into the subset. Every brand script mark is read
 * from source rather than hardcoded, so adding a mark cannot silently ship a
 * glyph the subset does not carry.
 */
function brandCodepoints() {
  const source = readFileSync(BRAND, "utf8");
  const marks = [...source.matchAll(/BRAND_SCRIPT_MARK(?:_[A-Z]{2})?\s*=\s*"([^"]+)"/g)]
    .map((m) => m[1])
    // The deprecated alias re-declares the Chinese mark; skipping it keeps the
    // "which marks exist" question answered by the two explicit constants.
    .filter((mark, index, all) => all.indexOf(mark) === index);
  if (marks.length === 0) throw new Error("No BRAND_SCRIPT_MARK* found in src/lib/brand.ts");
  console.log(`Brand marks: ${marks.join(" / ")}`);
  const extra = ["\u00b7", " "]; // separator / space kept so tracking works
  return [...new Set([...marks.join(""), ...extra])].map((ch) => ch.codePointAt(0));
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
  const coveredBySource = new Set();
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
    for (const c of wanted) if (covered.has(c)) coveredBySource.add(c);
    if ([...wanted].some((c) => covered.has(c))) picks.push(url);
  }

  // A glyph the source face does not carry is the failure that keeps recurring:
  // the build "succeeds", but the browser silently substitutes a second font for
  // that one character and the mark renders half in each typeface. Fail loudly
  // and name the offender instead of shipping a mismatched mark.
  const missing = [...wanted].filter((c) => !coveredBySource.has(c));
  if (missing.length > 0) {
    const named = missing.map((c) => `${String.fromCodePoint(c)} (U+${c.toString(16).toUpperCase()})`);
    throw new Error(
      `Shippori Mincho does not cover: ${named.join(", ")}. ` +
        "Pick a traditional form the Japanese Mincho ships (e.g. 鍋 not 锅) " +
        "or switch to a face with the needed coverage.",
    );
  }

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
  // `pyftsubset` is not always on PATH (a `pip install --user` puts it in
  // ~/.local/bin); the module form always resolves, so prefer it.
  execFileSync("python3", [
    "-m",
    "fontTools.subset",
    merged,
    `--unicodes=${unicodes.join(",")}`,
    "--flavor=woff2",
    `--output-file=${OUT}`,
    "--layout-features=",
    "--no-hinting",
    "--desubroutinize",
    "--drop-tables+=GSUB,GPOS,GDEF",
  ]);

  // Verify what actually landed in the file, not what we asked for: a subsetter
  // that quietly drops a glyph is exactly the silent-failure mode this script
  // exists to prevent.
  execFileSync("python3", ["-c", VERIFY_PY, OUT, ...unicodes], { stdio: "inherit" });

  const { size } = await import("node:fs").then((fs) => fs.statSync(OUT));
  console.log(`Wrote ${OUT} (${size} bytes)`);
}

/** Merge via fontTools — pyftsubset cannot combine two source files itself. */
const MERGE_PY = `
import sys
from fontTools.merge import Merger
Merger().merge(sys.argv[1:-1]).save(sys.argv[-1])
`;

/** Confirms the emitted woff2 carries every requested codepoint. */
const VERIFY_PY = `
import sys
from fontTools.ttLib import TTFont
path, *unicodes = sys.argv[1:]
font = TTFont(path)
cmap = set()
for table in font["cmap"].tables:
    cmap.update(table.cmap.keys())
missing = [u for u in unicodes if int(u[2:], 16) not in cmap]
if missing:
    raise SystemExit("subset is missing: " + ", ".join(missing))
print("verified %d codepoints present in %s" % (len(unicodes), path))
`;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
