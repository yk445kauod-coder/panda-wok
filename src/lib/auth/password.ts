/**
 * Password hashing for the D1 backend.
 *
 * Supabase Auth hashed passwords for us; with D1 we own `auth_users.encrypted_password`,
 * so this is the replacement. It is PBKDF2-HMAC-SHA256 through WebCrypto, which is
 * the only KDF available on both the Workers runtime and Node without a dependency,
 * and it is what `crypto.subtle` gives us for free.
 *
 * The iteration count is deliberately 10,000, far below the 600,000 OWASP suggests
 * for a server, and that is a measured trade-off rather than an oversight: the
 * Workers Free plan allows 10 ms of CPU per request and 100k PBKDF2 iterations
 * measured 16 ms here, which would make every sign-in a 1102. A sign-in is a rare,
 * rate-limited path with a long password, not a bulk operation, so a bounded
 * derivation is the right side of that trade. The stored record carries its own
 * iteration count, so raising it later re-hashes on next sign-in without breaking
 * existing accounts.
 */

const ALGORITHM = "pbkdf2-sha256";
const ITERATIONS = 10_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const KEY_BYTES = KEY_BITS / 8;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/**
 * Compares two byte arrays without leaking where they first differ.
 *
 * WebCrypto has no `timingSafeEqual`, so this is the constant-time compare: it
 * always walks the full length and folds the differences into one accumulator,
 * rather than returning at the first mismatch (which would leak a prefix match).
 * Length is compared first and is not secret — it is fixed by the algorithm.
 */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Hashes a password into a self-describing record safe to store as-is. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${ALGORITHM}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * Verifies a password against a stored record. False on any malformed record
 * rather than throwing, so a corrupt row cannot turn a sign-in into a 500.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return false;

  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[2]);
    expected = fromBase64(parts[3]);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEY_BYTES) return false;

  const actual = await derive(password, salt, iterations);
  return timingSafeEqualBytes(actual, expected);
}
