import { adminJson } from "@/lib/admin/api";
import { listFeatureFlags, listSettings } from "@/lib/services/admin-catalog";
import { getPublicSettings } from "@/lib/services/catalog";

/** Feature flags, business settings and the ordering lever. */
export async function GET() {
  return adminJson("settings.manage", async () => {
    const [flags, settings, publicSettings] = await Promise.all([
      listFeatureFlags(),
      listSettings(),
      getPublicSettings(),
    ]);
    return {
      flags,
      settings,
      acceptingOrders: publicSettings.ordering.acceptingOrders,
      hours: publicSettings.ordering.hours,
    };
  });
}
