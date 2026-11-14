import type { NextRequest } from "next/server";
import { adminJson } from "@/lib/admin/api";
import {
  countAdminOrders,
  getOrderStatusCounts,
  listAdminOrders,
  type OrderStatus,
} from "@/lib/services/admin-orders";
import { DEFAULT_PAGE_SIZE, resolvePage } from "@/components/ui/pagination";

const TABS: (OrderStatus | "active" | "all")[] = [
  "active", "new", "in_progress", "prepared", "out_for_delivery", "finished", "canceled", "all",
];

/** Orders list, status counts and the total, for the paged orders queue. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requested = params.get("status") ?? "active";
  const status = TABS.includes(requested as OrderStatus | "active" | "all")
    ? (requested as OrderStatus | "active" | "all")
    : "active";
  const page = resolvePage(params.get("page") ?? undefined);
  const q = params.get("q") ?? undefined;
  const filter = { status, search: q };

  return adminJson("orders.view", async () => {
    const [orders, counts, total] = await Promise.all([
      listAdminOrders({ ...filter, limit: DEFAULT_PAGE_SIZE, offset: (page - 1) * DEFAULT_PAGE_SIZE }),
      getOrderStatusCounts(),
      countAdminOrders(filter),
    ]);
    return { orders, counts, total, status, page, pageSize: DEFAULT_PAGE_SIZE, q };
  });
}
