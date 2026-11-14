import { adminJson } from "@/lib/admin/api";
import {
  getCrmCustomer,
  listActivity,
  listCustomerAddresses,
  listCustomerNotes,
  listCustomerTags,
  listCustomerTagsFor,
} from "@/lib/crm/customers";
import { getMyOrders } from "@/lib/services/orders";
import { listFeedbackAdmin, listOffers, listStaff } from "@/lib/services/admin-catalog";

/** One customer's full record: orders, activity, feedback, notes, tags, addresses. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return adminJson("crm.view", async () => {
    const customer = await getCrmCustomer(userId);
    if (!customer) return { customer: null };

    const [orders, activity, feedback, staff, notes, tags, assignedTags, addresses, allOffers] =
      await Promise.all([
        getMyOrders(userId, 15).catch(() => []),
        listActivity({ userId, limit: 40 }).catch(() => []),
        listFeedbackAdmin({ limit: 100 })
          .then((rows) => rows.filter((row) => row.user_id === userId))
          .catch(() => []),
        listStaff().catch(() => []),
        listCustomerNotes(userId).catch(() => []),
        listCustomerTags().catch(() => []),
        listCustomerTagsFor(userId).catch(() => []),
        listCustomerAddresses(userId).catch(() => []),
        listOffers().catch(() => []),
      ]);

    const staffRow = staff.find((row) => row.user_id === userId) ?? null;
    const customerOffers = allOffers.filter((offer) => offer.customer_id === userId);

    return { customer, orders, activity, feedback, staffRow, notes, tags, assignedTags, addresses, customerOffers };
  });
}
