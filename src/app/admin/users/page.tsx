import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { listStaff } from "@/lib/services/admin-catalog";
import { countCrmCustomers, listCrmCustomers } from "@/lib/crm/customers";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_PAGE_SIZE, Pagination, resolvePage } from "@/components/ui/pagination";
import { BlockUserControl, CreateStaffForm, StaffRoleForm } from "@/components/admin/customer-controls";
import { formatDate, formatDateTime, formatNumber, formatPrice, humanise } from "@/lib/utils/format";
import type { StaffRole } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * User management. Roles are edited here and enforced twice: once by the
 * capability check on every admin route, and again by row-level security in the
 * database, which is the real backstop.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const session = await requireCapability("users.manage");
  const canGrantPrivileged = session.role === "owner";
  const params = await searchParams;

  const page = resolvePage(params.page);
  const pageSize = DEFAULT_PAGE_SIZE;

  // The staff/role filters are applied outside SQL (they read the `staff` table),
  // so a page would be filtered down to almost nothing. When one is active the
  // whole book is fetched up to a hard ceiling and pagination is hidden, which
  // is honest about the fact that this view is not a true paged query.
  const roleFiltered = Boolean(params.role);
  const limit = roleFiltered ? 1000 : pageSize;
  const offset = roleFiltered ? 0 : (page - 1) * pageSize;

  const [customers, total, staff] = await Promise.all([
    listCrmCustomers({
      search: params.q,
      limit,
      offset,
    }).catch(() => []),
    countCrmCustomers(params.q).catch(() => 0),
    listStaff().catch(() => []),
  ]);

  const staffByUser = new Map(staff.map((row) => [row.user_id, row]));
  const roles = [...new Set(staff.map((row) => row.role))];

  const filtered =
    params.role === "staff"
      ? customers.filter((customer) => staffByUser.has(customer.user_id))
      : params.role === "blocked"
        ? customers.filter((customer) => customer.is_blocked)
        : params.role && roles.includes(params.role as StaffRole)
          ? customers.filter(
              (customer) => staffByUser.get(customer.user_id)?.role === params.role,
            )
          : customers;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Users"
        description="Customer accounts and staff access. Only the details needed for support and operations are shown."
        actions={
          <>
            <Badge tone="neutral">{formatNumber(total)} accounts</Badge>
            <Badge tone="info">{staff.length} staff</Badge>
          </>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="users-q" className="block text-xs font-medium text-ink-800">
            Search
          </label>
          <input
            id="users-q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name or phone"
            className="mt-1 h-10 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        </div>
        <div>
          <label htmlFor="users-role" className="block text-xs font-medium text-ink-800">
            Filter
          </label>
          <select
            id="users-role"
            name="role"
            defaultValue={params.role ?? ""}
            className="mt-1 h-10 rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="">Everyone</option>
            <option value="staff">Staff only</option>
            <option value="blocked">Blocked only</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {humanise(role)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-rice-50 hover:bg-indigo-700"
        >
          Apply
        </button>
        {params.q || params.role ? (
          <Link
            href="/admin/users"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <details className="washi-panel p-4">
        <summary className="cursor-pointer font-display text-base font-semibold text-ink-900">
          Create a team account
        </summary>
        <p className="mt-1 text-xs text-ink-700/70">
          Issues a role and an ops login id in one step. The person opens /admin
          with that id — no email, password or customer signup required.
        </p>
        <div className="mt-4 max-w-md">
          <CreateStaffForm canGrantPrivileged={canGrantPrivileged} />
        </div>
      </details>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            params.q || params.role ? "No users match this filter" : "No customer accounts yet"
          }
          description={
            params.q || params.role
              ? "Try a different search or clear the filter."
              : "Accounts appear here when customers sign up."
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((customer) => {
            const staffRow = staffByUser.get(customer.user_id) ?? null;
            return (
              <li key={customer.user_id} className="washi-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/crm/${customer.user_id}`}
                        className="font-display text-base font-semibold text-ink-900 hover:text-indigo-600"
                      >
                        {customer.full_name ?? "Unnamed user"}
                      </Link>
                      {staffRow ? (
                        <Badge tone={staffRow.is_active ? "success" : "neutral"}>
                          {humanise(staffRow.role)}
                          {staffRow.is_active ? "" : " (inactive)"}
                        </Badge>
                      ) : null}
                      {customer.is_blocked ? <Badge tone="danger">Blocked</Badge> : null}
                    </div>

                    <p className="mt-1 text-sm text-ink-800">
                      {customer.phone ?? "No phone"}
                      <span className="text-ink-700/65">
                        {" · joined "}
                        {formatDate(customer.created_at)}
                        {customer.last_seen_at
                          ? ` · last seen ${formatDateTime(customer.last_seen_at)}`
                          : ""}
                      </span>
                    </p>

                    <p className="mt-1 text-xs text-ink-700/70">
                      {formatNumber(customer.order_count)} orders ·{" "}
                      {formatPrice(customer.lifetime_value)} lifetime
                    </p>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-700">
                        {staffRow ? "Change staff role" : "Grant staff access"}
                      </summary>
                      <div className="mt-3 max-w-md">
                        <StaffRoleForm
                          userId={customer.user_id}
                          currentRole={staffRow?.role ?? null}
                          currentLoginId={staffRow?.login_id ?? null}
                          isActive={staffRow?.is_active ?? true}
                          displayName={staffRow?.display_name ?? customer.full_name}
                          canGrantPrivileged={canGrantPrivileged}
                        />
                      </div>
                    </details>
                  </div>

                  <BlockUserControl
                    userId={customer.user_id}
                    isBlocked={customer.is_blocked}
                    name={customer.full_name ?? "This user"}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!roleFiltered ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          basePath="/admin/users"
          searchParams={{ q: params.q }}
        />
      ) : null}

      <p className="text-xs text-ink-700/60">
        Role changes are recorded in the audit log with the acting staff member. The database
        independently enforces the same permissions through row-level security.
      </p>
    </div>
  );
}
