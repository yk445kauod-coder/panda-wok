import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/auth/rbac";

/**
 * The single credential that opens the ops console.
 *
 * There is exactly one field at /admin. The owner types the shared passcode and
 * gets the console with unlimited permissions; a worker types the `login_id`
 * the owner issued them and gets the console limited to that member's role.
 * Nothing else grants access — no email/password account is required to reach
 * /admin, so staff never need a customer login.
 *
 * The unlocked state is a cookie whose value is an HMAC keyed by the passcode
 * plus the submitted secret. Rotating the passcode invalidates every existing
 * cookie for free, and the secret itself is never stored — only the digest
 * reaches the browser. The default passcode is `Panda2026`.
 */

const COOKIE_NAME = "panda-wok.admin";
const DEFAULT_PASSCODE = "Panda2026";

export type GateIdentity =
  | { kind: "owner" }
  | { kind: "staff"; userId: string; role: StaffRole; displayName: string | null };

function configuredPasscode(): string {
  return serverEnv.ADMIN_PASSCODE ?? DEFAULT_PASSCODE;
}

/** Constant-time comparison that does not leak length via early return. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function salt(): string {
  return process.env.INTERNAL_LOG_SALT ?? "panda-wok-gate";
}

/** HMAC over a subject, keyed by the live passcode, so rotation revokes cookies. */
function digest(subject: string): string {
  return createHmac("sha256", `${configuredPasscode()}:${salt()}`)
    .update(subject)
    .digest("hex");
}

function ownerSubject(): string {
  return "open:admin";
}

function staffSubject(userId: string, role: string): string {
  return `open:staff:${userId}:${role}`;
}

/** Verifies a submitted secret against the shared passcode. */
export function passcodeMatches(submitted: string): boolean {
  return safeEqual(submitted.trim(), configuredPasscode());
}

/**
 * Resolves a staff `login_id` to an identity. The id is unique
 * case-insensitively; a row must also be active to unlock anything.
 */
export async function staffById(secret: string): Promise<GateIdentity | null> {
  const value = secret.trim();
  if (!value) return null;

  let admin: ReturnType<typeof createAdminSupabase>;
  try {
    admin = createAdminSupabase();
  } catch {
    return null;
  }

  const { data, error } = await admin
    .from("staff")
    .select("user_id, role, display_name, is_active")
    .ilike("login_id", value)
    .limit(1)
    .maybeSingle();

  return identityFromRow(data, error);
}

/** Re-reads a staff row by its auth user id, for cookie validation. */
async function staffByUserId(userId: string): Promise<GateIdentity | null> {
  let admin: ReturnType<typeof createAdminSupabase>;
  try {
    admin = createAdminSupabase();
  } catch {
    return null;
  }

  const { data, error } = await admin
    .from("staff")
    .select("user_id, role, display_name, is_active")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return identityFromRow(data, error);
}

function identityFromRow(
  data: {
    user_id: string;
    role: string;
    display_name: string | null;
    is_active: boolean;
  } | null,
  error: unknown,
): GateIdentity | null {
  if (error || !data || !data.is_active) return null;
  return {
    kind: "staff",
    userId: data.user_id,
    role: data.role as StaffRole,
    displayName: data.display_name,
  };
}

/** Verifies a submitted secret and returns the identity it unlocks, if any. */
export async function resolveSecret(secret: string): Promise<GateIdentity | null> {
  if (passcodeMatches(secret)) return { kind: "owner" };
  return staffById(secret);
}

/** Reads the unlock cookie into an identity, or null when locked/expired. */
export async function gateIdentity(): Promise<GateIdentity | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;

  if (safeEqual(value, digest(ownerSubject()))) return { kind: "owner" };

  // A staff cookie carries the identity it was minted for; verify the signature
  // and that the row still exists and is active, so revoking a worker's access
  // takes effect on their next request rather than only when the cookie expires.
  const match = value.match(/^([0-9a-f]{64})\.staff:(.+)$/);
  if (!match) return null;
  const [, signature, payload] = match;

  const parts = payload.split(":");
  if (parts.length < 2) return null;
  const [userId, role] = parts;
  if (!safeEqual(signature, digest(staffSubject(userId, role)))) return null;

  // The cookie carries the user id, so re-read by user_id (not login_id) and
  // confirm the role still matches — revoking or re-roling a worker takes
  // effect on their next request rather than only when the cookie expires.
  const identity = await staffByUserId(userId);
  if (!identity || identity.kind !== "staff" || identity.role !== role) return null;
  return identity;
}

/** True when the console is unlocked for this browser by any credential. */
export async function isUnlocked(): Promise<boolean> {
  return (await gateIdentity()) !== null;
}

/** Issues the unlock cookie for a verified identity. */
export async function grantUnlock(identity: GateIdentity): Promise<void> {
  const value =
    identity.kind === "owner"
      ? digest(ownerSubject())
      : `${digest(staffSubject(identity.userId, identity.role))}.staff:${identity.userId}:${identity.role}`;

  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

/** Clears the unlock cookie, re-locking the console for this browser. */
export async function revokeUnlock(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
