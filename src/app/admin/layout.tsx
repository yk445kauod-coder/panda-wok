import type { Metadata } from "next";
import { getAdminSession } from "@/lib/auth/session";
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
  const [session, settings] = await Promise.allSettled([
    getAdminSession(),
    getPublicSettings(),
  ]);
  const adminSession = session.status === "fulfilled" ? session.value : null;
  const brand =
    settings.status === "fulfilled" && settings.value?.brand
      ? settings.value.brand
      : undefined;

  if (!adminSession) {
    return <AdminGateForm brand={brand} />;
  }

  // No capability gate here on purpose: the roles do not share a single
  // capability (marketing has no orders.view, kitchen has no crm.view), so
  // requiring one would lock a legitimate member out of the whole console.
  // Each page guards itself, and this shell renders only what the role may open.
  return (
    <AdminShell
      role={adminSession.role}
      capabilities={capabilitiesFor(adminSession.role)}
      staffName={adminSession.profile?.full_name ?? ROLE_LABELS[adminSession.role]}
      brand={brand}
    >
      {children}
    </AdminShell>
  );
}
