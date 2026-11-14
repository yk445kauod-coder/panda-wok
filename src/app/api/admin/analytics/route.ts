import { adminJson } from "@/lib/admin/api";
import { getDashboardMetrics } from "@/lib/crm/insights";
import { getFunnel } from "@/lib/crm/customers";

/** Aggregates for the analytics page: window metrics plus the funnel. */
export async function GET() {
  return adminJson("analytics.view", async () => {
    const [metrics, funnel] = await Promise.all([getDashboardMetrics(30), getFunnel(30)]);
    return { metrics, funnel };
  });
}
