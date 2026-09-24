import type { Metadata } from "next";
import { requireCapability } from "@/lib/auth/session";
import { isUnlocked } from "@/lib/auth/admin-gate";
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
  // Layer 1: the shared ops passcode. Checked first so an unauthenticated
  // visitor sees a passcode prompt rather than being bounced to the customer
  // sign-in page.
  if (!(await isUnlocked())) {
    const settings = await getPublicSettings().catch(() => null);
    return <AdminGateForm scope="admin" brand={settings?.brand} />;
  }

  // Layer 2: a signed-in staff member holding at least the loosest capability.
  // Individual pages check the capability their own data requires.
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
