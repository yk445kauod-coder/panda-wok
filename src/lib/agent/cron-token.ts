import "server-only";
import { timingSafeEqual } from "node:crypto";
import { tryCreateAdminSupabase } from "@/lib/supabase/server";

/**
 * The shared secret for the scheduled agent endpoint.
 *
 * It lives in two places and only two: Supabase Vault (written by
 * `ensure_agent_cron_token`) and the Worker's `OPS_AGENT_CRON_TOKEN` secret. The
 * scheduled SQL job sends the Vault value; the route compares it against the
 * Worker secret. Neither side ever logs it, returns it, or puts it in a URL.
 *
 * Comparison is constant-time: a byte-by-byte early exit would let an attacker
 * recover the token by measuring response times.
 */

let cached: string | null = null;

async function readEnvToken(): Promise<string | null> {
  if (cached) return cached;
  const value = process.env["OPS_AGENT_CRON_TOKEN"];
  if (!value || value.length < 16) return null;
  cached = value;
  return cached;
}

/** Vault fallback, for a deployment that has not set the Worker secret yet. */
async function readVaultToken(): Promise<string | null> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return null;
  const { data, error } = await admin.rpc("get_ai_secret", {
    p_name: "ops_agent_cron_token",
  });
  if (error) return null;
  return typeof data === "string" && data.length >= 16 ? data : null;
}

export async function getCronToken(): Promise<string | null> {
  return (await readEnvToken()) ?? (await readVaultToken());
}

/** True when `presented` matches the configured token, in constant time. */
export async function verifyCronToken(presented: string | null): Promise<boolean> {
  const expected = await getCronToken();
  if (!expected || !presented) return false;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  // Length is not secret, but timingSafeEqual throws on a mismatch — guard it.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Extracts a bearer token from an Authorization header, if present. */
export function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
}
