import { adminJson } from "@/lib/admin/api";
import { getDashboardMetrics } from "@/lib/crm/insights";
import { getPublicSettings } from "@/lib/services/catalog";

/** Dashboard figures + the ordering lever's current state, for /admin. */
export async function GET() {
  return adminJson("orders.view", async () => {
    const [metrics, settings] = await Promise.all([
      getDashboardMetrics(30),
      getPublicSettings(),
    ]);
    return { metrics, acceptingOrders: settings.ordering.acceptingOrders };
  });
}
