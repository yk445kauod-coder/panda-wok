/**
 * Number grounding — the guard against an agent inventing figures.
 *
 * The model is told not to invent numbers, but a prompt is not a guarantee. This
 * module makes the guarantee structural: it collects every number the tools
 * actually returned, then inspects the model's prose for money or large figures
 * that are not among them. If it finds one, the caller replaces the answer with
 * the raw tool observations instead of showing a fabricated value.
 *
 * Scope of the check is deliberately narrow, because a false positive silently
 * discards a correct answer:
 *  - money is always checked (a currency token next to the number), and
 *  - any number of four or more digits is checked, except plausible years.
 * Small bare integers are ignored — "في 3 خطوات" is prose, not a data claim.
 */

/** Arabic-Indic and Eastern Arabic-Indic digits, mapped to ASCII. */
const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function normaliseDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d] ?? d);
}

const CURRENCY = /(?:ج\.?\s?م|جنيه|جنيها|EGP|£|\$|درهم|ريال|USD|EUR)/i;

type NumberToken = { raw: string; value: number; moneyMarked: boolean };

/**
 * Pulls candidate figures out of prose, with a flag for whether a currency word
 * sits on either side of the number.
 */
function numberTokens(text: string): NumberToken[] {
  const normalised = normaliseDigits(text);
  const tokens: NumberToken[] = [];
  const pattern = /\d[\d,.\u066B\u066C]*/g;
  for (const match of normalised.matchAll(pattern)) {
    const raw = match[0];
    const cleaned = raw.replace(/[,\u066C]/g, "").replace(/\u066B/g, ".");
    const value = Number(cleaned);
    if (!Number.isFinite(value)) continue;
    const at = match.index ?? 0;
    // Look a short distance either side for a currency word.
    const window = normalised.slice(Math.max(0, at - 12), at + raw.length + 12);
    tokens.push({ raw, value, moneyMarked: CURRENCY.test(window) });
  }
  return tokens;
}

function isPlausibleYear(value: number): boolean {
  return Number.isInteger(value) && value >= 1900 && value <= 2200;
}

/** Every numeric string the tool results contain, as one searchable blob. */
export function groundedText(observations: unknown[]): string {
  const parts: string[] = [];
  for (const observation of observations) {
    if (observation === null || observation === undefined) continue;
    try {
      parts.push(typeof observation === "string" ? observation : JSON.stringify(observation));
    } catch {
      // A circular or unserialisable payload contributes nothing to grounding.
    }
  }
  return normaliseDigits(parts.join(" ")).replace(/[,\u066C]/g, "").replace(/\u066B/g, ".");
}

/**
 * Numbers in `answer` that the tools never reported — the ones that make it a
 * fabrication. Empty array means the answer is grounded.
 */
export function findUngroundedFigures(answer: string, observations: unknown[]): string[] {
  const grounded = groundedText(observations);
  const offenders: string[] = [];
  for (const token of numberTokens(answer)) {
    if (isPlausibleYear(token.value)) continue;
    const digits = String(token.value);
    const significant = digits.replace("-", "").replace(".", "").length;
    const mustBeGrounded = token.moneyMarked || significant >= 4;
    if (!mustBeGrounded) continue;
    // Match on the canonical digits so "1,250" is found when the data held 1250.
    if (!grounded.includes(digits)) offenders.push(token.raw);
  }
  return offenders;
}

export type GroundingVerdict = { ok: true } | { ok: false; figures: string[] };

/** Convenience wrapper: does this answer contain an invented figure? */
export function checkGrounded(answer: string, observations: unknown[]): GroundingVerdict {
  const figures = findUngroundedFigures(answer, observations);
  return figures.length === 0 ? { ok: true } : { ok: false, figures };
}

/**
 * Arabic notice shown in place of a suppressed answer. It states plainly why the
 * text was withheld, so staff learn to distrust the model's unverified numbers
 * rather than the notice itself.
 */
export const FABRICATION_NOTICE =
  "الوكيل كتب أرقام مش موجودة في بيانات التشغيل، فاتشالت ومااتعرضتش. " +
  "تحت اللي الأدوات رجّعته بالحقيقة:";
