import "server-only";

import { createHash, randomUUID } from "node:crypto";

/**
 * Correlation id for a single server-action invocation. A v4 UUID is available
 * synchronously (Next 16 / Node 18+), so it can be generated at the top of an
 * action and returned to the client without an async round trip.
 */
export function newRequestId(): string {
  return randomUUID();
}

/**
 * One-way, salted hash of an identifier for logs. The salt is built from a
 * server-side secret so the digest is stable within an environment (letting an
 * operator correlate repeat failures) but cannot be reversed to the raw email
 * or phone number.
 */
export function hashIdentifier(value: string | null | undefined): string {
  if (!value) return "none";
  const secret =
    process.env.INTERNAL_LOG_SALT ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "panda-wok-log";
  return createHash("sha256")
    .update(`${secret}:${value}`)
    .digest("hex")
    .slice(0, 16);
}

type AuthEvent = "signup" | "signin" | "password_reset";

/**
 * Structured auth diagnostic. Emitted as a single JSON line so Cloudflare's
 * Workers Logs can index fields without log parsing, and never includes the
 * password, the access token, or the raw identifier — only a hash.
 */
export function logAuthEvent(params: {
  requestId: string;
  action: AuthEvent;
  outcome: "ok" | "error";
  code?: string;
  providerCode?: string;
  dbCode?: string;
  identifier?: string | null;
  phoneFirst?: boolean;
  durationMs: number;
}): void {
  const line = JSON.stringify({
    scope: "auth",
    requestId: params.requestId,
    action: params.action,
    outcome: params.outcome,
    code: params.code ?? null,
    providerCode: params.providerCode ?? null,
    dbCode: params.dbCode ?? null,
    identifierHash: hashIdentifier(params.identifier),
    phoneFirst: params.phoneFirst ?? null,
    durationMs: Math.round(params.durationMs),
    env: process.env.NODE_ENV ?? "unknown",
  });
  if (params.outcome === "error") console.error(line);
  else console.info(line);
}

/** Reads the machine `code` off a Supabase/provider error, if present. */
export function providerCodeOf(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

/** Reads the SQLSTATE off a PostgREST/Postgres error, if present. */
export function dbCodeOf(error: unknown): string | undefined {
  return providerCodeOf(error);
}
