import { adminJson } from "@/lib/admin/api";
import { listAdminCategories } from "@/lib/services/admin-catalog";

/** Category admin list, in display order. */
export async function GET() {
  return adminJson("menu.manage", () => listAdminCategories());
}
