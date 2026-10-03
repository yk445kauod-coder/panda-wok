import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { listOffers } from "@/lib/services/admin-catalog";
import { listCrmCustomers } from "@/lib/crm/customers";
import { OfferForm, type CustomerOption } from "@/components/admin/offer-form";
import { OfferList } from "@/components/admin/offer-list";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Threshold promotions. The checkout applies the single offer that saves the
 * customer the most, so these rows are alternatives rather than a stack — the
 * console says so, because "two active offers" reading as "both apply" is the
 * obvious and expensive misunderstanding.
 *
 * An offer is either for everyone or targeted at one customer. The customer
 * picker only appears for roles that may read CRM records; everyone else can
 * still create an untargeted offer.
 */
export default async function AdminOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await requireCapability("menu.manage");
  const t = await getT(await getAdminLocale());
  const params = await searchParams;

  const offers = await listOffers();
  const editing = params.edit
    ? (offers.find((offer) => offer.id === params.edit) ?? null)
    : null;

  const customers: CustomerOption[] = can(session.role, "crm.view")
    ? (await listCrmCustomers({ limit: 500 }).catch(() => [])).map((customer) => ({
        id: customer.user_id,
        name: customer.full_name ?? customer.phone ?? customer.email ?? "Unnamed customer",
      }))
    : [];

  const active = offers.filter((offer) => offer.is_enabled).length;

  const customerNames: Record<string, string> = {};
  for (const customer of customers) customerNames[customer.id] = customer.name;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">{t("admin.pages.offers.title")}</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("admin.pages.offers.description")}
          </p>
        </div>
        {params.edit ? (
          <Link
            href="/admin/offers"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            {t("admin.pages.offers.new")}
          </Link>
        ) : null}
      </header>

      <p className="washi-panel p-3 text-sm text-ink-800">
        {t("admin.pages.offers.notice")}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section
          className="washi-panel p-4"
          aria-label={editing ? t("admin.pages.offers.edit") : t("admin.pages.offers.add")}
        >
          <h2 className="font-display text-lg font-semibold text-ink-900">
            {editing ? `${t("admin.pages.offers.edit")} ${editing.name_en}` : t("admin.pages.offers.add")}
          </h2>
          <p className="mt-1 text-sm text-ink-700/75">
            {editing
              ? t("admin.pages.offers.editHint")
              : t("admin.pages.offers.addHint")}
          </p>
          <div className="mt-4">
            <OfferForm offer={editing} customers={customers} />
          </div>
        </section>

        <section aria-label="All offers">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Offers{" "}
              <span className="text-sm font-normal text-ink-700/60">
                ({formatNumber(offers.length)})
              </span>
            </h2>
            <span className="text-xs text-ink-700/70">
              {formatNumber(active)} active
            </span>
          </div>

          {offers.length === 0 ? (
            <EmptyState
              title={t("admin.pages.offers.empty")}
              description={t("admin.pages.offers.emptyBody")}
            />
          ) : (
            <OfferList offers={offers} customerNames={customerNames} />
          )}
        </section>
      </div>
    </div>
  );
}
