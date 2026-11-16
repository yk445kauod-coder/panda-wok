import { adminJson } from "@/lib/admin/api";
import { getPendingNewOrders } from "@/lib/services/admin-orders";

/**
 * The pending-order alert feed, as a plain GET.
 *
 * This used to be a Server Action (`listPendingOrderAlertsAction`), which is a
 * POST back to the *page* the console is on. Every console route is a static
 * shell, so that POST either 404'd (352 in one week), ran the whole App Router
 * pipeline to re-emit a static document (3,451), or exceeded the Free plan's
 * 10 ms CPU cap (210, Error 1102). The watcher is mounted in `AdminShell`, so
 * it fired on every console page, in every open tab, for every admin — the
 * measured cause of the request volume and the perceived lag.
 *
 * A GET to this route is one cheap Worker invocation: the gate check plus a
 * single indexed read of the `new` orders.
 */
export async function GET() {
  return adminJson("orders.view", () => getPendingNewOrders());
}
