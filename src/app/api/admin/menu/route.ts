import type { NextRequest } from "next/server";
import { adminJson } from "@/lib/admin/api";
import {
  getAdminMenuItem,
  getAdminModifierGroups,
  listAdminCategories,
  listAdminMenuItems,
} from "@/lib/services/admin-catalog";

/** Menu CMS: every dish (hidden included), the categories, and the dish being edited. */
export async function GET(request: NextRequest) {
  const edit = request.nextUrl.searchParams.get("edit");
  return adminJson("menu.manage", async () => {
    const [categories, items] = await Promise.all([
      listAdminCategories(),
      listAdminMenuItems({ limit: 400, includeArchived: true }),
    ]);
    const editing = edit ? await getAdminMenuItem(edit) : null;
    const modifierGroups = editing ? await getAdminModifierGroups(editing.id) : [];
    return { categories, items, editing, modifierGroups };
  });
}
