import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { can, type Capability, type StaffRole } from "@/lib/auth/rbac";

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
 * Reads the caller's identity, profile and staff role once per request. Cached
 * so multiple server components in one render share a single round trip.
 */
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
 * Requires a staff member holding a capability. Used by every admin page and
 * server action; the database re-checks through RLS.
 */
export async function requireCapability(
  capability: Capability,
): Promise<Session & { role: StaffRole }> {
  const session = await getSession();
  if (!session) redirect(`/auth/sign-in?next=/admin`);
  if (!session.role || !can(session.role, capability)) {
    redirect("/admin/denied");
  }
  return session as Session & { role: StaffRole };
}

/** Non-redirecting check for server actions, which must return an error result. */
export async function assertCapability(capability: Capability): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ForbiddenError("You need to sign in first.");
  if (!can(session.role, capability)) {
    throw new ForbiddenError();
  }
  return session;
}
