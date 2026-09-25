import type { Metadata } from "next";
import { getAdminSession, requireCapability } from "@/lib/auth/session";
import { getPublicSettings } from "@/lib/services/catalog";
import { capabilitiesFor, ROLE_LABELS } from "@/lib/auth/rbac";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminGateForm } from "@/components/admin/admin-gate-form";

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
  // The ops credential is the whole door. No customer login is required, and
  // nobody is bounced to the customer sign-in: an unauthenticated visitor sees
  // a single passcode field. The role then comes from the credential itself —
  // the passcode is the owner, a staff login id is that member's role.
  const session = await getAdminSession();
  if (!session) {
    const settings = await getPublicSettings().catch(() => null);
    return <AdminGateForm brand={settings?.brand} />;
  }

  // Defensive: the loosest capability every role holds. A role without even
  // this cannot render the console at all.
  await requireCapability("orders.view");

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
