import type { NextRequest } from "next/server";
import { adminJson } from "@/lib/admin/api";
import {
  countCrmCustomers,
  getCrmStats,
  listCrmCustomers,
  type CrmSort,
} from "@/lib/crm/customers";
import { DEFAULT_PAGE_SIZE, resolvePage } from "@/components/ui/pagination";

const SORTS: CrmSort[] = ["recent", "lifetime_value", "orders", "at_risk"];

/** CRM home: the whole-book stats and one page of customers. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q") ?? undefined;
  const page = resolvePage(params.get("page") ?? undefined);
  const requested = params.get("sort") ?? "lifetime_value";
  const sort: CrmSort = SORTS.includes(requested as CrmSort)
    ? (requested as CrmSort)
    : "lifetime_value";
  return adminJson("crm.view", async () => {
    const [customers, stats, total] = await Promise.all([
      listCrmCustomers({
        search: q,
        limit: DEFAULT_PAGE_SIZE,
        offset: (page - 1) * DEFAULT_PAGE_SIZE,
        sort,
      }),
      getCrmStats(),
      countCrmCustomers(q),
    ]);
    return { customers, stats, total, page, pageSize: DEFAULT_PAGE_SIZE, sort };
  });
}
