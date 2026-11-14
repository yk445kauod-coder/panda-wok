import type { NextRequest } from "next/server";
import { adminJson } from "@/lib/admin/api";
import { listStaff } from "@/lib/services/admin-catalog";
import { countCrmCustomers, listCrmCustomers } from "@/lib/crm/customers";
import { DEFAULT_PAGE_SIZE, resolvePage } from "@/components/ui/pagination";
import type { StaffRole } from "@/lib/auth/rbac";

/** Team & users: the customer book, staff rows and the current filters. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q") ?? undefined;
  const role = params.get("role") ?? undefined;
  const page = resolvePage(params.get("page") ?? undefined);

  return adminJson("users.manage", async () => {
    const roleFiltered = Boolean(role);
    const limit = roleFiltered ? 1000 : DEFAULT_PAGE_SIZE;
    const offset = roleFiltered ? 0 : (page - 1) * DEFAULT_PAGE_SIZE;

    const [customers, total, staff] = await Promise.all([
      listCrmCustomers({ search: q, limit, offset }).catch(() => []),
      countCrmCustomers(q).catch(() => 0),
      listStaff().catch(() => []),
    ]);

    const staffByUser = staff.map((row) => [row.user_id, row] as const);
    const roles = [...new Set(staff.map((row) => row.role))];

    const staffMap = new Map(staffByUser);
    const filtered =
      role === "staff"
        ? customers.filter((customer) => staffMap.has(customer.user_id))
        : role === "blocked"
          ? customers.filter((customer) => customer.is_blocked)
          : role && roles.includes(role as StaffRole)
            ? customers.filter((customer) => staffMap.get(customer.user_id)?.role === role)
            : customers;

    return {
      customers: filtered,
      total,
      staff,
      roles,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      roleFiltered,
      q,
      role,
    };
  });
}
