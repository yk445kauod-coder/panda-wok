import type { Metadata } from "next";
import { getAdminSession } from "@/lib/auth/session";
import { getPublicSettings } from "@/lib/services/catalog";
import { capabilitiesFor, can, ROLE_LABELS } from "@/lib/auth/rbac";
import { listStaffNotifications, countStaffUnread } from "@/lib/services/notifications";
import { getPendingNewOrders } from "@/lib/services/admin-orders";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminGateForm } from "@/components/admin/admin-gate-form";
import { I18nProvider } from "@/components/i18n-provider";
import { getAdminLocale, getDictionary } from "@/lib/i18n/server";

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

  // The console runs in its own locale: Arabic unless the staff member chose
  // otherwise. Repointing the provider here (and the `dir` on the shell) gives
  // the back office RTL layout without touching the customer site's direction.
  const locale = await getAdminLocale();
  const dict = await getDictionary(locale);

  if (!adminSession) {
    return (
      <I18nProvider locale={locale} dict={dict}>
        <AdminGateForm brand={brand} />
      </I18nProvider>
    );
  }

  // No capability gate here on purpose: the roles do not share a single
  // capability (marketing has no orders.view, kitchen has no crm.view), so
  // requiring one would lock a legitimate member out of the whole console.
  // Each page guards itself, and this shell renders only what the role may open.
  //
  // The staff notification feed only exists once a member is inside the gate, so
  // it is fetched here and handed to the shell's bell. A failure to load it must
  // never block the console, hence the allSettled-style tolerance.
  const [notifications, unread] = await Promise.all([
    listStaffNotifications(20).catch(() => []),
    countStaffUnread().catch(() => 0),
  ]);

  // The order alert rings on every console page, so its data is fetched here and
  // handed to the shell. Only roles that can see orders receive it; a failure
  // must never block the console.
  const pendingOrders = can(adminSession.role, "orders.view")
    ? (await getPendingNewOrders().catch(() => [])) ?? []
    : [];

  return (
    <I18nProvider locale={locale} dict={dict}>
      <AdminShell
        role={adminSession.role}
        capabilities={capabilitiesFor(adminSession.role)}
        staffName={adminSession.profile?.full_name ?? ROLE_LABELS[adminSession.role]}
        brand={brand}
        notifications={notifications}
        unreadCount={unread}
        pendingOrders={pendingOrders}
      >
        {children}
      </AdminShell>
    </I18nProvider>
  );
}
