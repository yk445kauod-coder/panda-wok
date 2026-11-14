"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/customers";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { BlockUserControl, CreateStaffForm, StaffRoleForm } from "@/components/admin/customer-controls";
import { formatDate, formatDateTime, formatNumber, formatPrice } from "@/lib/utils/format";
import { PageError, PageLoading } from "@/components/admin/page-states";
import { useAdminData } from "@/lib/admin/client";
import { useAdminSession } from "@/components/admin/admin-session";
import { useT } from "@/components/i18n-provider";
import type { StaffRole } from "@/lib/auth/rbac";

type StaffRow = {
  user_id: string;
  display_name: string | null;
  login_id: string | null;
  is_active: boolean;
  role: StaffRole;
};

type UsersPayload = {
  customers: CrmCustomer[];
  total: number;
  staff: StaffRow[];
  roles: StaffRole[];
  page: number;
  pageSize: number;
  roleFiltered: boolean;
  q?: string;
  role?: string;
};

/**
 * User management. Roles are edited here and enforced twice: once by the
 * capability check on every admin route, and again by row-level security in the
 * database, which is the real backstop. The filtered book arrives from
 * `/api/admin/users`.
 */
export function UsersPage() {
  const t = useT();
  const { role: sessionRole } = useAdminSession();
  const canGrantPrivileged = sessionRole === "owner";
  const params = useSearchParams();

  const q = params.get("q") ?? undefined;
  const role = params.get("role") ?? undefined;
  const page = params.get("page") ?? undefined;

  const { data, loading, error } = useAdminData<UsersPayload>("/api/admin/users", {
    q,
    role,
    page,
  });

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <PageError message={error} />;

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const staff = data?.staff ?? [];
  const roles = data?.roles ?? [];
  const pageSize = data?.pageSize ?? 0;
  const currentPage = data?.page ?? 1;
  const roleFiltered = data?.roleFiltered ?? false;

  const staffByUser = new Map(staff.map((row) => [row.user_id, row]));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("admin.users.eyebrow")}
        title={t("admin.users.title")}
        description={t("admin.users.description")}
        actions={
          <>
            <Badge tone="neutral">{t("admin.users.accounts", { count: formatNumber(total) })}</Badge>
            <Badge tone="info">{t("admin.users.staffCount", { count: staff.length })}</Badge>
          </>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="users-q" className="block text-xs font-medium text-ink-800">
            {t("admin.users.searchLabel")}
          </label>
          <input
            id="users-q"
            name="q"
            defaultValue={q ?? ""}
            placeholder={t("admin.users.searchPlaceholder")}
            className="mt-1 h-10 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        </div>
        <div>
          <label htmlFor="users-role" className="block text-xs font-medium text-ink-800">
            {t("admin.users.filterLabel")}
          </label>
          <select
            id="users-role"
            name="role"
            defaultValue={role ?? ""}
            className="mt-1 h-10 rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="">{t("admin.users.everyone")}</option>
            <option value="staff">{t("admin.users.staffOnly")}</option>
            <option value="blocked">{t("admin.users.blockedOnly")}</option>
            {roles.map((option) => (
              <option key={option} value={option}>
                {t(`admin.term.role.${option}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-xl bg-vermilion-600 px-4 text-sm font-medium text-rice-50 hover:bg-vermilion-700"
        >
          {t("admin.users.apply")}
        </button>
        {q || role ? (
          <Link
            href="/admin/users"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            {t("admin.users.clear")}
          </Link>
        ) : null}
      </form>

      <details className="washi-panel p-4">
        <summary className="cursor-pointer font-display text-base font-semibold text-ink-900">
          {t("admin.users.createTeam")}
        </summary>
        <p className="mt-1 text-xs text-ink-700/70">{t("admin.users.createTeamHint")}</p>
        <div className="mt-4 max-w-md">
          <CreateStaffForm canGrantPrivileged={canGrantPrivileged} />
        </div>
      </details>

      {customers.length === 0 ? (
        <EmptyState
          title={q || role ? t("admin.users.noMatch") : t("admin.users.noAccounts")}
          description={
            q || role ? t("admin.users.noMatchBody") : t("admin.users.noAccountsBody")
          }
        />
      ) : (
        <ul className="space-y-3">
          {customers.map((customer) => {
            const staffRow = staffByUser.get(customer.user_id) ?? null;
            return (
              <li key={customer.user_id} className="washi-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/crm/${customer.user_id}`}
                        className="font-display text-base font-semibold text-ink-900 hover:text-vermilion-600"
                      >
                        {customer.full_name ?? t("admin.users.unnamed")}
                      </Link>
                      {staffRow ? (
                        <Badge tone={staffRow.is_active ? "success" : "neutral"}>
                          {t(`admin.term.role.${staffRow.role}`)}
                          {staffRow.is_active ? "" : ` ${t("admin.users.inactive")}`}
                        </Badge>
                      ) : null}
                      {customer.is_blocked ? (
                        <Badge tone="danger">{t("admin.users.blocked")}</Badge>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-ink-800">
                      {customer.phone ?? t("admin.users.noPhone")}
                      <span className="text-ink-700/65">
                        {" · "}
                        {t("admin.users.joined")} {formatDate(customer.created_at)}
                        {customer.last_seen_at
                          ? ` · ${t("admin.users.lastSeen")} ${formatDateTime(customer.last_seen_at)}`
                          : ""}
                      </span>
                    </p>

                    <p className="mt-1 text-xs text-ink-700/70">
                      {t("admin.users.ordersLifetime", {
                        orders: formatNumber(customer.order_count),
                        value: formatPrice(customer.lifetime_value),
                      })}
                    </p>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-vermilion-600 hover:text-vermilion-700">
                        {staffRow ? t("admin.users.changeRole") : t("admin.users.grantAccess")}
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
                    name={customer.full_name ?? t("admin.users.unnamed")}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!roleFiltered ? (
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={total}
          basePath="/admin/users"
          searchParams={{ q }}
        />
      ) : null}

      <p className="text-xs text-ink-700/60">{t("admin.users.auditNote")}</p>
    </div>
  );
}
