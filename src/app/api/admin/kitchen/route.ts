import { adminJson } from "@/lib/admin/api";
import { getKitchenQueue } from "@/lib/services/admin-orders";

/** The four kitchen columns, freshest first, for the pass board. */
export async function GET() {
  return adminJson("kitchen.view", () => getKitchenQueue());
}
