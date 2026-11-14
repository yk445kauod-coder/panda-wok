import { adminJson } from "@/lib/admin/api";
import { listOffers } from "@/lib/services/admin-catalog";
import { listCrmCustomers } from "@/lib/crm/customers";
import { can } from "@/lib/auth/rbac";

/**
 * Offers plus the customer picker. The picker is only filled for roles that may
 * read CRM records — everyone else still gets an untargeted offer form.
 */
export async function GET() {
  return adminJson("menu.manage", async () => {
    const { assertGateCapability } = await import("@/lib/auth/session");
    const role = await assertGateCapability("menu.manage");
    const offers = await listOffers();
    const customers = can(role, "crm.view")
      ? (await listCrmCustomers({ limit: 500 }).catch(() => [])).map((customer) => ({
          id: customer.user_id,
          name: customer.full_name ?? customer.phone ?? customer.email ?? "Unnamed customer",
        }))
      : [];
    return { offers, customers };
  });
}
