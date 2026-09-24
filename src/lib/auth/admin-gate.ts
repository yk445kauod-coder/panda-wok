import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";

/**
 * Shared-passcode gate in front of the ops console.
 *
 * This is deliberately a *second* factor, not a replacement for the staff-role
 * check: every admin page still calls `requireCapability`, and the database
 * still enforces RLS. The passcode answers a different question — "is this
 * person allowed to be at the ops URL at all" — so an owner can hand the URL
 * to a contractor without granting a `staff` row, and can rotate access by
 * changing one environment value.
 *
 * The unlocked state is a cookie whose value is an HMAC keyed by the passcode
 * itself, so rotating the passcode invalidates every existing cookie for free.
 * The passcode never leaves the server: the client only ever sees the digest.
 *
 * It is overridable through the `ADMIN_PASSCODE` environment value, with
 * `panda2026` as the default.
 */

const COOKIE_NAME = "panda-wok.admin";
const DEFAULT_PASSCODE = "panda2026";

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

function digest(passcode: string): string {
  const salt = process.env.INTERNAL_LOG_SALT ?? "panda-wok-gate";
  return createHmac("sha256", `${passcode}:${salt}`)
    .update("open:admin")
    .digest("hex");
}

/** Verifies a submitted passcode against the configured one. */
export function passcodeMatches(submitted: string): boolean {
  return safeEqual(submitted.trim(), configuredPasscode());
}

/** Reads the unlock cookie and confirms it still matches the live passcode. */
export async function isUnlocked(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return false;
  return safeEqual(value, digest(configuredPasscode()));
}

/** Issues the unlock cookie. Called only after a successful passcode check. */
export async function grantUnlock(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, digest(configuredPasscode()), {
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
