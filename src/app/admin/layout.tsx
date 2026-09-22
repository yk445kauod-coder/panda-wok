import type { Metadata } from "next";
import { requireCapability } from "@/lib/auth/session";
import { capabilitiesFor, ROLE_LABELS } from "@/lib/auth/rbac";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * Nothing under /admin is indexable: every page is transactional or internal.
 * The robots directive here is belt-and-braces alongside robots.txt.
 */
export const metadata: Metadata = {
  title: "Panda Wok Ops",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The loosest capability any staff member holds. Individual pages check the
  // capability their own data requires.
  const session = await requireCapability("orders.view");

  return (
    <AdminShell
      role={session.role}
      capabilities={capabilitiesFor(session.role)}
      staffName={session.profile?.full_name ?? ROLE_LABELS[session.role]}
    >
      {children}
    </AdminShell>
  );
}
