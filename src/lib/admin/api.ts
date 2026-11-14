import { NextResponse } from "next/server";
import {
  assertGateCapability,
  assertGateUnlocked,
  ForbiddenError,
} from "@/lib/auth/session";
import type { Capability, StaffRole } from "@/lib/auth/rbac";

/**
 * Wraps an admin JSON read endpoint.
 *
 * Every console page used to be a server component, so the Worker rendered
 * React, checked the unlock cookie and ran the page's Supabase queries on each
 * document request — the CPU cost that pushed the console past the Free-plan
 * budget once a few tabs were open. The console is now a static shell, and each
 * page asks one of these endpoints for its data instead.
 *
 * Auth is the cheap gate check (`assertGateCapability`): one staff read for a
 * staff cookie, none for the owner, and never a customer-session lookup. A
 * missing or insufficient credential is a 401/403, which the client turns into
 * the passcode screen or a redirect, mirroring the old server-side
 * `requireCapability` behaviour.
 */
export async function adminJson<T>(
  capability: Capability,
  load: () => Promise<T>,
): Promise<NextResponse> {
  return guard(async () => {
    await assertGateCapability(capability);
    return load();
  });
}

/**
 * The unlocked-only variant, for screens every member may open regardless of
 * role — the guide and the denied screen. It still requires the unlock cookie,
 * but no capability, matching those pages' server-side guards.
 */
export async function adminJsonUnlocked<T>(
  load: (role: StaffRole) => Promise<T>,
): Promise<NextResponse> {
  return guard(async () => {
    const role = await assertGateUnlocked();
    return load(role);
  });
}

async function guard<T>(run: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await run();
    return NextResponse.json(
      { ok: true, data },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    console.error("admin api read failed", error);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
