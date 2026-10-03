import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Star } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
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
import { Badge } from "@/components/ui/button";
import { BlockUserControl, DeleteCustomerControl, StaffRoleForm } from "@/components/admin/customer-controls";
import { CustomerOffersPanel } from "@/components/admin/customer-offers-panel";
import { CustomerNotesPanel } from "@/components/admin/crm-notes";
import { formatDate, formatDateTime, formatNumber, formatPrice } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

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
  const t = await getT(await getAdminLocale());

  const customer = await getCrmCustomer(userId);
  if (!customer) notFound();

  // Annotating a customer is support/admin work, never a kitchen task; the
  // server action and RLS enforce the same line, this only hides the controls.
  const canEditCrm = ["owner", "admin", "manager", "support", "marketing"].includes(session.role);

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

  const customerOffers = allOffers.filter((offer) => offer.customer_id === userId);

  const staffRow = staff.find((row) => row.user_id === userId) ?? null;

  return (
    <div className="space-y-5">
      <Link
        href="/admin/crm"
        className="inline-flex items-center gap-1.5 text-sm text-ink-700 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("admin.pages.customerProfile.allCustomers")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {customer.full_name ?? t("admin.pages.customerProfile.unnamed")}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-800">
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-1.5 text-vermilion-600 hover:text-vermilion-700"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {customer.phone}
              </a>
            ) : null}
            {customer.email ? (
              <a
                href={`mailto:${customer.email}`}
                className="inline-flex items-center gap-1.5 text-vermilion-600 hover:text-vermilion-700"
              >
                <Mail className="size-3.5" aria-hidden="true" />
                {customer.email}
              </a>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-ink-700/65">
            {t("admin.pages.customerProfile.joined")} {formatDate(customer.created_at)}
            {customer.last_seen_at
              ? ` · ${t("admin.pages.customerProfile.lastSeen")} ${formatDateTime(customer.last_seen_at)}`
              : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {customer.is_blocked ? (
              <Badge tone="danger">{t("admin.pages.customerProfile.blocked")}</Badge>
            ) : null}
            {customer.marketing_opt_in ? (
              <Badge tone="info">{t("admin.pages.customerProfile.marketingOptIn")}</Badge>
            ) : null}
            {customer.order_count >= 3 ? (
              <Badge tone="success">{t("admin.pages.customerProfile.loyal")}</Badge>
            ) : null}
            <Badge tone="indigo">
              {t(`admin.term.tier.${customer.tier}`)} ·{" "}
              {t("admin.pages.customerProfile.pointsSuffix", {
                count: formatNumber(customer.points_balance),
              })}
            </Badge>
          </div>
        </div>

        <div className="w-full max-w-xs space-y-2">
          <BlockUserControl
            userId={customer.user_id}
            isBlocked={customer.is_blocked}
            name={customer.full_name ?? t("admin.pages.customerProfile.unnamed")}
          />
          {session.role === "owner" || session.role === "admin" ? (
            <DeleteCustomerControl
              userId={customer.user_id}
              name={customer.full_name ?? t("admin.pages.customerProfile.unnamed")}
              hasOrders={customer.order_count > 0}
            />
          ) : null}
        </div>
      </header>

      <section
        aria-label={t("admin.pages.customerProfile.metrics")}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Metric
          label={t("admin.pages.customerProfile.orders")}
          value={formatNumber(customer.order_count)}
        />
        <Metric
          label={t("admin.pages.customerProfile.lifetimeSpend")}
          value={formatPrice(customer.lifetime_value)}
        />
        <Metric
          label={t("admin.pages.customerProfile.averageOrder")}
          value={formatPrice(customer.avg_order_value)}
        />
        <Metric
          label={t("admin.pages.customerProfile.daysSince")}
          value={
            customer.days_since_last_order === null
              ? t("admin.pages.customerProfile.neverOrdered")
              : String(customer.days_since_last_order)
          }
        />
      </section>

      {customer.favorite_items && customer.favorite_items.length > 0 ? (
        <section
          className="washi-panel p-4"
          aria-label={t("admin.pages.customerProfile.favouriteItems")}
        >
          <h2 className="font-display text-base font-semibold text-ink-900">
            {t("admin.pages.customerProfile.usuallyOrders")}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {customer.favorite_items.map((item) => (
              <li key={item}>
                <Badge tone="neutral">{item}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CustomerNotesPanel
        customerId={customer.user_id}
        notes={notes}
        tags={tags}
        assigned={assignedTags}
        canEdit={canEditCrm}
      />

      <CustomerOffersPanel
        customerId={customer.user_id}
        customerName={customer.full_name ?? t("admin.pages.customerProfile.unnamed")}
        offers={customerOffers}
      />

      <section
        className="washi-panel p-4"
        aria-label={t("admin.pages.customerProfile.addresses")}
      >
        <h2 className="font-display text-base font-semibold text-ink-900">
          {t("admin.pages.customerProfile.addresses")}
        </h2>
        {addresses.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700/70">
            {t("admin.pages.customerProfile.noAddresses")}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {addresses.map((address) => {
              const line = [
                address.address_line,
                address.building,
                address.floor,
                address.apartment,
              ]
                .filter(Boolean)
                .join(", ");
              const area = [address.area, address.city].filter(Boolean).join(", ");
              const pin =
                address.latitude != null && address.longitude != null
                  ? `https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`
                  : null;
              return (
                <li key={address.id} className="rounded-xl border border-ink-900/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{address.label}</span>
                    {address.is_default ? (
                      <Badge tone="success">
                        {t("admin.pages.customerProfile.defaultAddress")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-800">{line}</p>
                  {area ? <p className="text-xs text-ink-700/75">{area}</p> : null}
                  {address.landmark ? (
                    <p className="text-xs text-ink-700/75">
                      {t("admin.pages.customerProfile.landmarkPrefix")} {address.landmark}
                    </p>
                  ) : null}
                  {address.contact_phone ? (
                    <a
                      href={`tel:${address.contact_phone}`}
                      className="mt-1 inline-flex text-xs text-vermilion-600 hover:text-vermilion-700"
                    >
                      {address.contact_phone}
                    </a>
                  ) : null}
                  {pin ? (
                    <a
                      href={pin}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 block text-xs font-medium text-jade-700 hover:text-jade-800"
                    >
                      {t("admin.pages.customerProfile.openPin")}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="washi-panel p-4"
          aria-label={t("admin.pages.customerProfile.orders")}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink-900">
              {t("admin.pages.customerProfile.recentOrders")}
            </h2>
            <Link href="/admin/orders" className="text-xs font-medium text-vermilion-600">
              {t("admin.pages.customerProfile.orderQueue")}
            </Link>
          </div>

          {orders.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700/70">
              {t("admin.pages.customerProfile.noOrders")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/8">
              {orders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-sm font-medium text-ink-900 hover:text-vermilion-600"
                    >
                      #{order.order_number}
                    </Link>
                    <p className="text-xs text-ink-700/70">
                      {formatDateTime(order.created_at)} ·{" "}
                      {t(`admin.term.orderStatus.${order.status}`)}
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

        <section
          className="washi-panel p-4"
          aria-label={t("admin.pages.customerProfile.activityTimeline")}
        >
          <h2 className="font-display text-base font-semibold text-ink-900">
            {t("admin.pages.customerProfile.activity")}
          </h2>

          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700/70">
              {t("admin.pages.customerProfile.noActivity")}
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
                    <p className="text-sm text-ink-900">
                      {t(`admin.term.activityEvent.${entry.event}`)}
                    </p>
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

      <section
        className="washi-panel p-4"
        aria-label={t("admin.pages.customerProfile.feedback")}
      >
        <h2 className="font-display text-base font-semibold text-ink-900">
          {t("admin.pages.customerProfile.feedback")}
        </h2>

        {feedback.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700/70">
            {t("admin.pages.customerProfile.noFeedback")}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {feedback.map((item) => (
              <li key={item.id} className="rounded-xl border border-ink-900/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-ink-900">
                    <Star className="size-3.5 text-miso-500" aria-hidden="true" />
                    {item.rating}/5
                  </span>
                  <Badge tone="neutral">
                    {t(`admin.term.feedbackCategory.${item.category}`)}
                  </Badge>
                  <Badge tone={item.status === "resolved" ? "success" : "warning"}>
                    {t(`admin.term.feedbackStatus.${item.status}`)}
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

      <section
        className="washi-panel p-4"
        aria-label={t("admin.pages.customerProfile.staffAccess")}
      >
        <h2 className="font-display text-base font-semibold text-ink-900">
          {t("admin.pages.customerProfile.staffAccess")}
        </h2>
        <p className="mt-1 text-xs text-ink-700/70">
          {t("admin.pages.customerProfile.staffAccessHint")}
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
