import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/admin-app";

/**
 * Nothing under /admin is indexable: every page is transactional or internal.
 * The robots directive here is belt-and-braces alongside robots.txt.
 */
export const metadata: Metadata = {
  title: "Panda Wok Ops",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The console shell, deliberately static.
 *
 * This layout reads no cookies, no headers and no database — so Next prerenders
 * it once at build time and the Worker serves the same HTML for every `/admin`
 * route. The gate check, the role, the notifications and the pending-order feed
 * all move into `AdminApp`, which fetches them from `/api/admin/session` in the
 * browser. That is what takes the console off the Worker's CPU budget: a page
 * load is now one static document plus one cheap JSON call, however many tabs a
 * staff member has open.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminApp>{children}</AdminApp>;
}
