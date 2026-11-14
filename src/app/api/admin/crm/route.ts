import type { NextRequest } from "next/server";
import { adminJson } from "@/lib/admin/api";
import { getCrmStats, listCrmCustomers } from "@/lib/crm/customers";

/** CRM home: the whole-book stats and the first page of customers. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  return adminJson("crm.view", async () => {
    const [customers, stats] = await Promise.all([
      listCrmCustomers({ search: q, limit: 100 }),
      getCrmStats(),
    ]);
    return { customers, stats };
  });
}
