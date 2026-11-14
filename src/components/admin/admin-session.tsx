"use client";

import { createContext, useContext } from "react";
import type { Capability, StaffRole } from "@/lib/auth/rbac";

/**
 * The signed-in member, shared with every console page.
 *
 * `AdminApp` resolves it once from `/api/admin/session`; pages read it to decide
 * what to show (an owner-only control, a CRM-gated picker) without each of them
 * asking the server again. It mirrors the old server components, which received
 * the same facts from `requireCapability`.
 */
export type AdminSession = {
  role: StaffRole;
  capabilities: Capability[];
  staffName: string;
  brand: { name: string; logo_url: string | null };
};

const AdminSessionContext = createContext<AdminSession | null>(null);

export function AdminSessionProvider({
  value,
  children,
}: {
  value: AdminSession;
  children: React.ReactNode;
}) {
  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  );
}

/** The current member. Only valid inside the unlocked console shell. */
export function useAdminSession(): AdminSession {
  const value = useContext(AdminSessionContext);
  if (!value) throw new Error("useAdminSession used outside the console shell");
  return value;
}
