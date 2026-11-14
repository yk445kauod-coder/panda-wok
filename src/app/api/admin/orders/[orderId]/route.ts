import { adminJson } from "@/lib/admin/api";
import { getAdminOrder } from "@/lib/services/admin-orders";

/** One order with its items, address snapshot and status history. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  return adminJson("orders.view", () => getAdminOrder(orderId));
}
