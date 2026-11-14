import { describe, expect, it } from "vitest";
import { createAdminSupabase } from "@/lib/supabase/server";

/**
 * Live probe for the staff-session RLS tightening
 * (`20261114000300_staff_sessions_rls`).
 *
 * The console now mints a real Supabase session for the acting member, so the
 * browser holds a token that can reach PostgREST directly. Every staff *read*
 * policy therefore has to agree with the console's own role matrix — otherwise a
 * kitchen member's token could read settings, analytics, the audit log or
 * customer rows they cannot see in the console, which is a privilege widening
 * rather than the refactor it is meant to be.
 *
 * The predicate must also stay `to authenticated`: a policy that also applies to
 * `anon` evaluates a staff helper function for anonymous visitors, and anon has
 * no EXECUTE grant on it — the read then fails with "permission denied for
 * function …" (this is exactly how the menu broke once).
 *
 * Skipped unless RLS_LIVE=1 so the normal suite never touches production.
 */
const live = process.env.RLS_LIVE === "1";

const ROLE_AWARE: Record<string, string> = {
  settings: "admin",
  audit_logs: "admin",
  analytics_events: "can_view_analytics",
  activity_logs: "can_view_crm",
  categories: "can_manage_menu",
  offers: "can_manage_menu",
  orders: "can_manage_orders",
  order_items: "can_manage_orders",
  order_status_history: "can_manage_orders",
  profiles: "can_view_crm",
  staff: "manager",
};

describe.skipIf(!live)("staff read policies are role-aware and authenticated-only", () => {
  it("narrows every staff read to a role helper, never the coarse is_staff()", async () => {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("pg_policies" as never)
      .select("tablename, policyname, qual, roles")
      .eq("schemaname", "public")
      .eq("cmd", "SELECT")
      .in("tablename", Object.keys(ROLE_AWARE));
    expect(error).toBeNull();

    const rows = (data ?? []) as unknown as {
      tablename: string;
      policyname: string;
      qual: string | null;
      roles: string[] | string;
    }[];

    const offenders: string[] = [];
    for (const row of rows) {
      // Public reads are separate policies and are left alone.
      if (/_public_read$|_owner_read$/.test(row.policyname) && !/_staff_read$/.test(row.policyname)) {
        if (row.policyname !== "order_items_owner_read" && row.policyname !== "order_status_history_owner_read") {
          continue;
        }
      }
      const qual = row.qual ?? "";
      const roles = Array.isArray(row.roles) ? row.roles : String(row.roles);
      const expected = ROLE_AWARE[row.tablename];

      if (/is_staff\(\)/.test(qual) && !expected) offenders.push(`${row.tablename}.${row.policyname}: still is_staff()`);
      if (!roles.includes("authenticated")) {
        offenders.push(`${row.tablename}.${row.policyname}: roles=${roles}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
