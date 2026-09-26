import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { can, firstAccessibleHref, type Capability, type StaffRole } from "@/lib/auth/rbac";
import { gateIdentity, type GateIdentity } from "@/lib/auth/admin-gate";
import { tryCreateAdminSupabase } from "@/lib/supabase/service";

export type SessionProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  locale: string;
  marketing_opt_in: boolean;
  notifications_opt_in: boolean;
  is_blocked: boolean;
  created_at: string;
  last_seen_at: string | null;
};

export type Session = {
  user: User;
  email: string | null;
  profile: SessionProfile | null;
  role: StaffRole | null;
  isStaff: boolean;
};

/**
 * Ops-console identity. The console is opened with the passcode (owner) or a
 * staff login id, so the acting role comes from the gate cookie, not from a
 * Supabase session. `user` is null when the owner used the passcode and is not
 * signed in as a customer.
 */
export type AdminSession = Omit<Session, "user"> & {
  user: User | null;
  role: StaffRole;
  gate: GateIdentity;
  /**
   * Identity written to audit rows and to every `created_by`/`updated_by`
   * column, so a real action is never recorded against a null actor. Null only
   * when the owner opened the console with the passcode and no owner staff row
   * exists to attribute to — those columns are nullable, so this degrades to an
   * unattributed entry rather than failing the operation.
   */
  actorId: string | null;
};

function profileFromGate(identity: GateIdentity): SessionProfile {
  return {
    id: identity.kind === "staff" ? identity.userId : "owner",
    full_name:
      identity.kind === "staff"
        ? (identity.displayName ?? null)
        : "Owner",
    phone: null,
    email: null,
    locale: "en",
    marketing_opt_in: false,
    notifications_opt_in: false,
    is_blocked: false,
    created_at: new Date(0).toISOString(),
    last_seen_at: null,
  };
}

/** Reads the caller's customer identity once per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const user = data.user;

  const [{ data: profile }, { data: staffRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, phone, email, locale, marketing_opt_in, notifications_opt_in, is_blocked, created_at, last_seen_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("staff")
      .select("role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  return {
    user,
    email: user.email ?? null,
    profile: profile ?? null,
    role: (staffRow?.role as StaffRole | undefined) ?? null,
    isStaff: Boolean(staffRow),
  };
});

/** Requires a signed-in customer. Redirects to sign-in with a return path. */
export async function requireUser(returnTo?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const target = returnTo
      ? `/auth/sign-in?next=${encodeURIComponent(returnTo)}`
      : "/auth/sign-in";
    redirect(target);
  }
  return session;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * The user id that audit rows and `created_by` columns should be attributed to
 * for this gate identity. Prefers the signed-in customer when the same person is
 * also logged in, then the gate's own staff id, then any active owner staff row
 * (so the shared passcode still attributes to the founding owner rather than
 * writing a null actor).
 */
async function resolveActorId(
  gate: GateIdentity,
  customerId: string | undefined,
): Promise<string | null> {
  if (customerId) return customerId;
  if (gate.kind === "staff") return gate.userId;

  const admin = tryCreateAdminSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("staff")
    .select("user_id")
    .eq("role", "owner")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Resolves the acting ops identity from the gate. Returns null when the console
 * is locked, which is what sends a visitor to the passcode screen.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const gate = await gateIdentity();
  if (!gate) return null;

  const role: StaffRole = gate.kind === "owner" ? "owner" : gate.role;
  const customer = await getSession().catch(() => null);

  // Prefer the customer profile when the same person is also signed in, so
  // their name shows in the shell; fall back to the gate identity otherwise.
  const profile = customer?.profile ?? profileFromGate(gate);
  const actorId = await resolveActorId(gate, customer?.user?.id);

  return {
    user: customer?.user ?? null,
    email: customer?.email ?? null,
    profile,
    role,
    isStaff: gate.kind === "staff",
    gate,
    actorId,
  };
}

/**
 * Requires an unlocked ops session holding a capability. Used by every admin
 * page; identity comes from the gate, never from a customer session.
 *
 * A member who lacks the capability is sent to their own first accessible page
 * rather than a dead end, so navigating to the wrong URL self-corrects instead
 * of stranding them on a denied screen.
 */
export async function requireCapability(
  capability: Capability,
): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/denied");
  if (!can(session.role, capability)) {
    const home = firstAccessibleHref(session.role);
    // A page the role may not open is only a denial when there is nowhere else
    // to send them; otherwise they simply arrive at a screen they can use.
    redirect(home === "/admin/denied" ? "/admin/denied" : home);
  }
  return session;
}

/** Non-redirecting check for server actions, which must return an error result. */
export async function assertCapability(capability: Capability): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new ForbiddenError("Unlock the ops console first.");
  if (!can(session.role, capability)) throw new ForbiddenError();
  return session;
}
