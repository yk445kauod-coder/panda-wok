/**
 * Customer sessions for the D1 backend.
 *
 * Supabase Auth issued a JWT and refreshed it on every navigation. With D1 there
 * is no auth server, so the session is a **stateless signed cookie**: the user id
 * and an expiry, signed with an HMAC. Nothing is stored server-side, which matters
 * because every read would otherwise be a D1 query on a plan with a tight
 * per-request subrequest budget, and a Worker isolate cannot hold a session table
 * in memory.
 *
 * What the signature buys, and what it does not:
 *
 *  - It stops a cookie from being forged or edited. A visitor cannot invent a
 *    `user_id` and become that account, because they cannot produce the HMAC.
 *  - It does **not** make the session revocable. A stolen cookie stays valid until
 *    it expires, exactly as a Supabase refresh token did. Sign-out clears it on
 *    the browser; a server-side revocation list would put a D1 read back on every
 *    request, which is the cost this design exists to avoid.
 *
 * The secret comes from `AUTH_SECRET`. When it is absent the module refuses to
 * mint or accept a session rather than falling back to a default — a hardcoded
 * fallback would sign every deployment with a value an attacker could read from
 * this file and forge any account.
 */

import "server-only";

/** The cookie the browser holds. Not the Supabase name, so the two cannot be confused. */
export const SESSION_COOKIE = "pw-auth-token";

/** Eight hours, matching the console gate cookie. */
const MAX_AGE_SECONDS = 60 * 60 * 8;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SessionClaims = {
  /** The `auth_users.id` the session belongs to. */
  sub: string;
  /** Expiry, in seconds since the epoch. */
  exp: number;
};

/**
 * Reads `AUTH_SECRET` without importing `config/env.ts`.
 *
 * This module is reachable from the middleware, and `env.ts` validates through
 * zod. Importing it here would ship the whole validator in the middleware bundle
 * on every request — the regression that caused Error 1102 on the Free plan
 * (documented in `public-env.ts`, which exists for the same reason). The
 * computed `process.env[name]` lookup also keeps the value out of the bundle,
 * where a literal `process.env.AUTH_SECRET` would be inlined at build time and
 * arrive empty at runtime.
 */
function secret(): string | null {
  const value = process.env["AUTH_SECRET"];
  return value && value.length >= 32 ? value : null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function key(): Promise<CryptoKey | null> {
  const value = secret();
  if (!value) return null;
  return crypto.subtle.importKey("raw", encoder.encode(value), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Mints a signed token for a user id. Null when `AUTH_SECRET` is unset. */
export async function createSessionToken(userId: string): Promise<string | null> {
  const signingKey = await key();
  if (!signingKey) return null;

  const claims: SessionClaims = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", signingKey, encoder.encode(payload)),
  );
  return `${payload}.${toBase64Url(signature)}`;
}

/**
 * Verifies a token and returns its claims, or null.
 *
 * The expiry is checked against the current time *after* the signature verifies,
 * so a tampered `exp` cannot extend a session — the signature covers it.
 */
export async function readSessionToken(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  const signingKey = await key();
  if (!signingKey) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signaturePart = token.slice(dot + 1);

  let signature: Uint8Array;
  try {
    signature = fromBase64Url(signaturePart);
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    signingKey,
    signature as unknown as BufferSource,
    encoder.encode(payload),
  );
  if (!valid) return null;

  let claims: SessionClaims;
  try {
    claims = JSON.parse(decoder.decode(fromBase64Url(payload))) as SessionClaims;
  } catch {
    return null;
  }
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
  return claims;
}

/** The `Set-Cookie` value that stores a session for eight hours. */
export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

/**
 * Whether a cookie name could hold a session.
 *
 * A session is small (a uuid plus a signature), so unlike the Supabase token it
 * is never chunked into `.0`, `.1`, … The check still accepts the suffix so a
 * cookie left by an earlier build is recognised and cleared rather than ignored.
 */
export function isSessionCookieName(name: string): boolean {
  return name === SESSION_COOKIE || name.startsWith(`${SESSION_COOKIE}.`);
}
