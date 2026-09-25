import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Star } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getCrmCustomer, listActivity } from "@/lib/crm/customers";
import { getMyOrders } from "@/lib/services/orders";
import { listFeedbackAdmin, listStaff } from "@/lib/services/admin-catalog";
import { Badge } from "@/components/ui/button";
import { BlockUserControl, StaffRoleForm } from "@/components/admin/customer-controls";
import { formatDate, formatDateTime, formatNumber, formatPrice, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * Customer 360. Combines the CRM aggregate, the order list, feedback and the
 * activity timeline into one view so support can answer a question without
 * hopping between pages.
 */
export default async function CrmCustomerPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await requireCapability("crm.view");
  const canGrantPrivileged = session.role === "owner";

  const customer = await getCrmCustomer(userId);
  if (!customer) notFound();

  const [orders, activity, feedback, staff] = await Promise.all([
    getMyOrders(userId, 15).catch(() => []),
    listActivity({ userId, limit: 40 }).catch(() => []),
    listFeedbackAdmin({ limit: 100 })
      .then((rows) => rows.filter((row) => row.user_id === userId))
      .catch(() => []),
    listStaff().catch(() => []),
  ]);

  const staffRow = staff.find((row) => row.user_id === userId) ?? null;

  return (
    <div className="space-y-5">
      <Link
        href="/admin/crm"
        className="inline-flex items-center gap-1.5 text-sm text-ink-700 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All customers
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {customer.full_name ?? "Unnamed customer"}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-800">
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-1.5 text-plum-600 hover:text-plum-700"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {customer.phone}
              </a>
            ) : null}
            {customer.email ? (
              <a
                href={`mailto:${customer.email}`}
                className="inline-flex items-center gap-1.5 text-plum-600 hover:text-plum-700"
              >
                <Mail className="size-3.5" aria-hidden="true" />
                {customer.email}
              </a>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-ink-700/65">
            Joined {formatDate(customer.created_at)}
            {customer.last_seen_at
              ? ` · last seen ${formatDateTime(customer.last_seen_at)}`
              : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {customer.is_blocked ? <Badge tone="danger">Blocked</Badge> : null}
            {customer.marketing_opt_in ? <Badge tone="info">Marketing opt-in</Badge> : null}
            {customer.order_count >= 3 ? <Badge tone="success">Loyal</Badge> : null}
            <Badge tone="plum">
              {humanise(customer.tier)} · {formatNumber(customer.points_balance)} points
            </Badge>
          </div>
        </div>

        <div className="w-full max-w-xs">
          <BlockUserControl
            userId={customer.user_id}
            isBlocked={customer.is_blocked}
            name={customer.full_name ?? "This customer"}
          />
        </div>
      </header>

      <section aria-label="Customer metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Orders" value={formatNumber(customer.order_count)} />
        <Metric label="Lifetime spend" value={formatPrice(customer.lifetime_value)} />
        <Metric label="Average order" value={formatPrice(customer.avg_order_value)} />
        <Metric
          label="Days since last order"
          value={
            customer.days_since_last_order === null
              ? "Never ordered"
              : String(customer.days_since_last_order)
          }
        />
      </section>

      {customer.favorite_items && customer.favorite_items.length > 0 ? (
        <section className="washi-panel p-4" aria-label="Favourite items">
          <h2 className="font-display text-base font-semibold text-ink-900">Usually orders</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {customer.favorite_items.map((item) => (
              <li key={item}>
                <Badge tone="neutral">{item}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="washi-panel p-4" aria-label="Orders">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink-900">Recent orders</h2>
            <Link href="/admin/orders" className="text-xs font-medium text-plum-600">
              Order queue
            </Link>
          </div>

          {orders.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700/70">This customer has not ordered yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/8">
              {orders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-sm font-medium text-ink-900 hover:text-plum-600"
                    >
                      #{order.order_number}
                    </Link>
                    <p className="text-xs text-ink-700/70">
                      {formatDateTime(order.created_at)} · {humanise(order.status)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-ink-800">
                    {formatPrice(order.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="washi-panel p-4" aria-label="Activity timeline">
          <h2 className="font-display text-base font-semibold text-ink-900">Activity</h2>

          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700/70">
              No recorded activity for this customer.
            </p>
          ) : (
            <ol className="mt-3 space-y-3">
              {activity.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-bamboo-500"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-ink-900">{humanise(entry.event)}</p>
                    <p className="text-xs text-ink-700/65">
                      {formatDateTime(entry.created_at)}
                      {entry.entity ? ` · ${entry.entity}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="washi-panel p-4" aria-label="Feedback">
        <h2 className="font-display text-base font-semibold text-ink-900">Feedback</h2>

        {feedback.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700/70">No feedback submitted by this customer.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {feedback.map((item) => (
              <li key={item.id} className="rounded-xl border border-ink-900/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-ink-900">
                    <Star className="size-3.5 text-miso-500" aria-hidden="true" />
                    {item.rating}/5
                  </span>
                  <Badge tone="neutral">{humanise(item.category)}</Badge>
                  <Badge tone={item.status === "resolved" ? "success" : "warning"}>
                    {humanise(item.status)}
                  </Badge>
                  <span className="text-xs text-ink-700/65">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink-800/90">{item.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="washi-panel p-4" aria-label="Staff access">
        <h2 className="font-display text-base font-semibold text-ink-900">
          Staff access
        </h2>
        <p className="mt-1 text-xs text-ink-700/70">
          Grant this person a staff role. Roles are checked on every admin page and mirrored
          by row-level security in the database.
        </p>
        <div className="mt-3">
          <StaffRoleForm
            userId={customer.user_id}
            currentRole={staffRow?.role ?? null}
            currentLoginId={staffRow?.login_id ?? null}
            isActive={staffRow?.is_active ?? true}
            displayName={staffRow?.display_name ?? customer.full_name}
            canGrantPrivileged={canGrantPrivileged}
          />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="washi-panel p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/75">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink-900">
        {value}
      </p>
    </div>
  );
}
