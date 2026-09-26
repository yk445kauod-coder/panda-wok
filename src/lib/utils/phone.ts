/**
 * Phone normalisation shared by validation (client and server) and the auth
 * actions. Pure and dependency-free so it can run in either environment.
 *
 * The product is Egypt-first: a number typed as `01277593815`, `1277593815`,
 * `+201277593815` or `00201277593815` all identify the same subscriber. They
 * must reduce to one canonical form or the unique index on `profiles.phone`
 * (and Supabase's own identity) cannot recognise a returning customer.
 */

/** Strips every non-digit character. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Last ten digits, so +20/0 prefixes and spacing variants map to one value. */
export function phoneNationalDigits(phone: string): string {
  return phoneDigits(phone).slice(-10);
}

/**
 * Canonical E.164 for Egyptian numbers, falling back to the last ten digits
 * prefixed with `+20` for any other shape. Returns null when the input does not
 * contain a plausible subscriber number, so callers can reject it.
 */
export function canonicalPhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (!/^[+0-9()\-\s]+$/.test(trimmed)) return null;

  const digits = phoneDigits(trimmed);
  if (digits.length < 6) return null;

  if (digits.startsWith("00")) {
    const rest = digits.slice(2);
    return rest ? `+${rest}` : null;
  }
  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.startsWith("20") && digits.length >= 11) {
    return `+${digits}`;
  }
  if (digits.startsWith("0")) {
    // Egyptian national form 0XXXXXXXXXX -> +20XXXXXXXXX.
    return `+20${digits.slice(1)}`;
  }
  // Bare national number without a trunk zero.
  return `+20${digits}`;
}

/**
 * Every stored shape a given number might already have, so a duplicate lookup
 * catches rows written before canonicalisation was introduced (the owner
 * profile holds `01277593815`, not `+201277593815`).
 */
export function phoneLookupCandidates(phone: string): string[] {
  const trimmed = phone.trim();
  const digits = phoneDigits(trimmed);
  const national = phoneNationalDigits(trimmed);
  const candidates = new Set<string>();
  if (trimmed) candidates.add(trimmed);
  if (digits) candidates.add(digits);
  if (national) {
    candidates.add(national);
    candidates.add(`0${national}`);
    candidates.add(`20${national}`);
    candidates.add(`+20${national}`);
  }
  return [...candidates];
}
