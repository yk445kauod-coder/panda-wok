#!/usr/bin/env node
/**
 * Build `src/lib/agent/pdf-font.generated.ts` — the font embedded in generated PDFs.
 *
 * PDF does not shape text and a Worker cannot rasterise, so the PDF writer needs
 * three things as data at runtime: the font file itself, a codepoint -> glyph-id
 * map, and each glyph's advance width. All three are extracted here and
 * committed, so the Worker never parses a font and never downloads one.
 *
 * The source font must cover the Arabic block AND the Arabic Presentation Forms-B
 * block, because `src/lib/agent/arabic.ts` pre-shapes letters into those forms
 * before they reach the PDF. DejaVu Sans covers both, in one file, so a report
 * does not need a second embedded font for its Latin and numeric runs.
 *
 * Usage: npm run pdf-font   (requires python3 + fontTools)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/lib/agent/pdf-font.generated.ts");
const TMP = join(ROOT, ".pdf-font-tmp");

const SOURCE_CANDIDATES = [
  process.env.PDF_FONT_TTF,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
  "/Library/Fonts/Arial Unicode.ttf",
].filter(Boolean);

const source = SOURCE_CANDIDATES.find((p) => existsSync(p));
if (!source) {
  console.error(
    "No source font found. Set PDF_FONT_TTF to a TTF that covers Arabic and\n" +
      "Arabic Presentation Forms-B (DejaVu Sans and Noto Naskh Arabic both do).",
  );
  process.exit(1);
}
console.log(`Source font: ${source}`);

mkdirSync(TMP, { recursive: true });
const subsetPath = join(TMP, "subset.ttf");
const metricsPath = join(TMP, "metrics.json");

/**
 * The subset. Ranges rather than a character list: the Arabic and presentation
 * blocks are dense, and every glyph in them is a plausible letter form.
 */
const RANGES = [
  [0x20, 0x7e], // basic Latin
  [0xa0, 0xff], // Latin-1 supplement (degree, multiply, accented names)
  [0x600, 0x6ff], // Arabic
  [0x2000, 0x206f], // general punctuation (– — ‘ ’ “ ” • …)
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B (the shaped forms)
];

const python = `
import json
from fontTools import subset
from fontTools.ttLib import TTFont

ranges = ${JSON.stringify(RANGES)}
codepoints = []
for lo, hi in ranges:
    codepoints.extend(range(lo, hi + 1))

options = subset.Options()
options.layout_features = ["*"]
options.notdef_outline = True
options.recalc_bounds = True
options.drop_tables += ["DSIG"]
font = subset.load_font(${JSON.stringify(source)}, options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=codepoints)
subsetter.subset(font)
subset.save_font(font, ${JSON.stringify(subsetPath)}, options)
font.close()

# Re-open the subset and record exactly what a PDF writer needs.
f = TTFont(${JSON.stringify(subsetPath)})
upem = f["head"].unitsPerEm
cmap = f.getBestCmap()
hmtx = f["hmtx"]

entries = {}
for cp, name in cmap.items():
    if cp not in codepoints:
        continue
    gid = f.getGlyphID(name)
    width = hmtx[name][0]
    entries[cp] = [gid, width]

missing = [cp for cp in codepoints if cp not in entries]
# Only the presentation forms matter: the PDF writer pre-shapes Arabic into
# those, so a gap in the base block (U+0600..) is harmless while a gap in the
# shaped range renders a letter as a blank box. The check is scoped to
# FE80..FEFC — the range src/lib/agent/arabic.ts can emit — because FE75,
# FEFD and FEFE are unassigned codepoints that no font carries.
forms = [cp for cp in range(0xfe80, 0xfefd) if cp in codepoints]
missing_forms = [cp for cp in forms if cp not in entries]

# Font descriptor values. A PDF reader uses these to lay out the font before it
# reads the file, so they have to be present and in the font's own units.
hhea = f["hhea"]
head = f["head"]
os2 = f["OS/2"] if "OS/2" in f else None
with open(${JSON.stringify(metricsPath)}, "w") as fh:
    json.dump({
        "unitsPerEm": upem,
        "entries": {str(k): v for k, v in entries.items()},
        "missingForms": missing_forms,
        "ascent": hhea.ascent,
        "descent": hhea.descent,
        "bbox": [head.xMin, head.yMin, head.xMax, head.yMax],
        "capHeight": getattr(os2, "sCapHeight", None) or hhea.ascent,
        "italicAngle": head.macStyle and 0 or 0,
    }, fh)
print(f"glyphs={len(entries)} upem={upem} presentationForms={len(forms)} missingForms={len(missing_forms)} ascent={hhea.ascent} descent={hhea.descent}")
`;

execFileSync("python3", ["-c", python], { stdio: "inherit" });

const metrics = JSON.parse(readFileSync(metricsPath, "utf8"));
const ttf = readFileSync(subsetPath);
const base64 = ttf.toString("base64");

if (metrics.missingForms.length > 0) {
  console.warn(
    `WARNING: ${metrics.missingForms.length} Arabic Presentation Forms are absent from the ` +
      `subset font (first: U+${metrics.missingForms[0].toString(16)}). ` +
      `Shaped text using them would render as blank.`,
  );
}

const header = `// GENERATED by scripts/build-pdf-font.mjs — do not edit by hand.
// Run \`npm run pdf-font\` after changing the source font or the subset ranges.
//
// Source: ${source.split("/").pop()}
// ${Object.keys(metrics.entries).length} glyphs, ${(ttf.length / 1024).toFixed(0)} KB.

/** Units per em, for converting advance widths to PDF text space. */
export const PDF_FONT_UPEM = ${metrics.unitsPerEm};

/** Font descriptor values, in font units. */
export const PDF_FONT_METRICS = {
  ascent: ${metrics.ascent},
  descent: ${metrics.descent},
  bbox: [${metrics.bbox.join(", ")}] as [number, number, number, number],
  capHeight: ${metrics.capHeight},
  italicAngle: ${metrics.italicAngle},
};

/** The subset font, embedded verbatim as a PDF FontFile2 stream. */
export const PDF_FONT_BASE64 =
  "${base64}";

/**
 * codepoint -> [glyphId, advanceWidth]. A flat array keeps the generated file
 * small; the writer turns it into a Map on first use.
 */
export const PDF_FONT_ENTRIES: [number, number, number][] = [
${Object.entries(metrics.entries)
  .map(([cp, [gid, width]]) => `  [${cp}, ${gid}, ${width}],`)
  .join("\n")}
];
`;

writeFileSync(OUT, header);
rmSync(TMP, { recursive: true, force: true });
console.log(`Wrote ${OUT} (${(header.length / 1024).toFixed(0)} KB of source)`);
