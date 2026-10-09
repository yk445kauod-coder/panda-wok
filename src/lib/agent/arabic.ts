/**
 * Arabic shaping and a simplified bidi reorder, for formats that do no shaping
 * of their own.
 *
 * PDF is a "dumb" format: it draws the glyphs you give it, in the order you give
 * them. There is no HarfBuzz at render time, so an Arabic PDF must arrive
 * already shaped (letters in their contextual initial/medial/final forms) and
 * already reordered right-to-left. Emitting logical-order Unicode produces
 * disconnected letters in reverse — which is exactly what a report must not look
 * like.
 *
 * The approach is the classic one: map each letter to its contextual form in the
 * Unicode Arabic Presentation Forms-B block. That block is a plain cmap lookup,
 * so it needs no GSUB table and no font subsetting machinery — it works with any
 * font that ships those glyphs.
 *
 * This is deliberately not a full Unicode bidi implementation. It handles what a
 * restaurant report actually contains: Arabic text with embedded Latin words and
 * numbers, which stay in their own left-to-right order inside the Arabic line.
 */

/** Letters that join to the following letter (have initial and medial forms). */
const DUAL_JOINING = "بتثجحخسشصضطظعغفقكلمنهيئ";
/** Letters that join only to the preceding letter (final form only). */
const RIGHT_JOINING = "ادذرزوؤأإآةى";

const ARABIC = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
const LATIN_OR_DIGIT = /[0-9A-Za-z\u0660-\u0669\u06f0-\u06f9]/;

/**
 * base letter -> [isolated, final, initial, medial] presentation forms.
 * A missing entry means that form does not exist for that letter.
 */
const FORMS: Record<string, number[]> = {
  "\u0621": [0xfe80],
  "\u0622": [0xfe81, 0xfe82],
  "\u0623": [0xfe83, 0xfe84],
  "\u0624": [0xfe85, 0xfe86],
  "\u0625": [0xfe87, 0xfe88],
  "\u0626": [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],
  "\u0627": [0xfe8d, 0xfe8e],
  "\u0628": [0xfe8f, 0xfe90, 0xfe91, 0xfe92],
  "\u0629": [0xfe93, 0xfe94],
  "\u062a": [0xfe95, 0xfe96, 0xfe97, 0xfe98],
  "\u062b": [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
  "\u062c": [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  "\u062d": [0xfea1, 0xfea2, 0xfea3, 0xfea4],
  "\u062e": [0xfea5, 0xfea6, 0xfea7, 0xfea8],
  "\u062f": [0xfea9, 0xfeaa],
  "\u0630": [0xfeab, 0xfeac],
  "\u0631": [0xfead, 0xfeae],
  "\u0632": [0xfeaf, 0xfeb0],
  "\u0633": [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4],
  "\u0634": [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  "\u0635": [0xfeb9, 0xfeba, 0xfebb, 0xfebc],
  "\u0636": [0xfebd, 0xfebe, 0xfebf, 0xfec0],
  "\u0637": [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  "\u0638": [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  "\u0639": [0xfec9, 0xfeca, 0xfecb, 0xfecc],
  "\u063a": [0xfecd, 0xfece, 0xfecf, 0xfed0],
  "\u0641": [0xfed1, 0xfed2, 0xfed3, 0xfed4],
  "\u0642": [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  "\u0643": [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  "\u0644": [0xfedd, 0xfede, 0xfedf, 0xfee0],
  "\u0645": [0xfee1, 0xfee2, 0xfee3, 0xfee4],
  "\u0646": [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  "\u0647": [0xfee9, 0xfeea, 0xfeeb, 0xfeec],
  "\u0648": [0xfeed, 0xfeee],
  "\u0649": [0xfeef, 0xfef0],
  "\u064a": [0xfef1, 0xfef2, 0xfef3, 0xfef4],
};

/** Lam + alef ligatures, keyed by the alef variant. [isolated, final]. */
const LAM_ALEF: Record<string, [number, number]> = {
  "\u0622": [0xfef5, 0xfef6],
  "\u0623": [0xfef7, 0xfef8],
  "\u0625": [0xfef9, 0xfefa],
  "\u0627": [0xfefb, 0xfefc],
};

export function isArabic(text: string): boolean {
  return ARABIC.test(text);
}

/** True when the string contains Arabic, i.e. should be laid out RTL. */
export function isRtl(text: string): boolean {
  return isArabic(text);
}

const isDual = (ch: string) => DUAL_JOINING.includes(ch);
const joinsBack = (ch: string) => isDual(ch) || RIGHT_JOINING.includes(ch);

/**
 * Shapes a single Arabic run (no Latin inside) into presentation forms.
 * Returns the forms in *logical* order; the caller reverses for display.
 */
function shapeRun(chars: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];

    // Lam + alef becomes one glyph, so the pair is consumed together.
    if (ch === "\u0644" && next && LAM_ALEF[next]) {
      const connectsToPrev = i > 0 && isDual(chars[i - 1]);
      const [iso, fin] = LAM_ALEF[next];
      out.push(String.fromCodePoint(connectsToPrev ? fin : iso));
      i += 1;
      continue;
    }

    const forms = FORMS[ch];
    if (!forms) {
      out.push(ch);
      continue;
    }

    const prevConnects = i > 0 && isDual(chars[i - 1]);
    const selfBack = joinsBack(ch);
    const selfForward = isDual(ch);
    const nextConnects = Boolean(next) && joinsBack(next) && selfForward;

    let code: number | undefined;
    if (prevConnects && selfBack && selfForward && nextConnects) code = forms[3];
    else if (prevConnects && selfBack) code = forms[1];
    else if (selfForward && nextConnects) code = forms[2];
    else code = forms[0];

    out.push(code ? String.fromCodePoint(code) : ch);
  }
  return out;
}

type Run = { text: string; rtl: boolean };

/**
 * Splits into directional runs with neutral resolution.
 *
 * Neutrals (spaces, punctuation) are the whole difficulty: attaching them to the
 * preceding run shifts every boundary space one position once the runs are
 * reversed, which is what produced "أوردر2" with no space between them. The
 * Unicode bidi rule for this is to give a neutral run the direction of its
 * neighbours, or the paragraph direction when the two sides disagree — so a
 * space between Arabic and a Latin number becomes part of the Arabic run and
 * lands in the right place after the reorder.
 */
function splitRuns(input: string): Run[] {
  const chars = [...input];
  const classes = chars.map((ch) =>
    ARABIC.test(ch) ? "R" : LATIN_OR_DIGIT.test(ch) ? "L" : "N",
  );
  const resolved: ("R" | "L")[] = new Array(chars.length);

  for (let i = 0; i < classes.length; i += 1) {
    if (classes[i] !== "N") {
      resolved[i] = classes[i] as "R" | "L";
      continue;
    }
    let j = i;
    while (j < classes.length && classes[j] === "N") j += 1;
    const before = i > 0 ? resolved[i - 1] : null;
    const after = j < classes.length ? (classes[j] as "R" | "L") : null;
    // Latin on both sides keeps the neutral Latin; anything else (including a
    // boundary) takes the paragraph direction, which is RTL here.
    const type = before === "L" && after === "L" ? "L" : "R";
    for (let k = i; k < j; k += 1) resolved[k] = type;
    i = j - 1;
  }

  const runs: Run[] = [];
  for (let k = 0; k < chars.length; k += 1) {
    const rtl = resolved[k] === "R";
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.text += chars[k];
    else runs.push({ text: chars[k], rtl });
  }
  return runs;
}

/**
 * Reorders one line into visual order and shapes the Arabic in it.
 *
 * Returns the string as it should be drawn left-to-right, which for an RTL line
 * means the run order is reversed while each Latin/number run keeps its own
 * internal order.
 */
export function visualLine(line: string): string {
  const runs = splitRuns(line);
  if (runs.length === 0) return line;

  const visual: string[] = [];
  // An RTL paragraph draws right-to-left, so emit runs back to front.
  for (const run of runs) {
    if (run.rtl) {
      visual.push([...shapeRun([...run.text])].reverse().join(""));
    } else {
      visual.push(run.text);
    }
  }
  return visual.reverse().join("");
}

/** Shapes and reorders a whole paragraph, line by line. */
export function shapeParagraph(text: string): string {
  return text
    .split("\n")
    .map((line) => (isRtl(line) ? visualLine(line) : line))
    .join("\n");
}
