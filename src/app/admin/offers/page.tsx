import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { listOffers } from "@/lib/services/admin-catalog";
import { OfferForm } from "@/components/admin/offer-form";
import { OfferList } from "@/components/admin/offer-list";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * Threshold promotions. The checkout applies the single offer that saves the
 * customer the most, so these rows are alternatives rather than a stack — the
 * console says so, because "two active offers" reading as "both apply" is the
 * obvious and expensive misunderstanding.
 */
export default async function AdminOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireCapability("menu.manage");
  const params = await searchParams;

  const offers = await listOffers();
  const editing = params.edit
    ? (offers.find((offer) => offer.id === params.edit) ?? null)
    : null;

  const active = offers.filter((offer) => offer.is_enabled).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Offers</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Automatic discounts applied at checkout when a basket reaches a value
            you set — for example 50 off any order over 200.
          </p>
        </div>
        {params.edit ? (
          <Link
            href="/admin/offers"
            className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm leading-10 text-ink-800 hover:bg-rice-200"
          >
            New offer
          </Link>
        ) : null}
      </header>

      <p className="washi-panel p-3 text-sm text-ink-800">
        Only one offer applies per order: the one that saves the customer the most.
        Stacking them would let a basket discount below cost, so think of these as
        competing alternatives rather than add-ons. Nothing here is shown to
        customers until you create it — there are no default promotions.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section
          className="washi-panel p-4"
          aria-label={editing ? "Edit offer" : "Create an offer"}
        >
          <h2 className="font-display text-lg font-semibold text-ink-900">
            {editing ? `Edit ${editing.name_en}` : "Add an offer"}
          </h2>
          <p className="mt-1 text-sm text-ink-700/75">
            {editing
              ? "Change the amount, the threshold or the name, then save."
              : "Set how much comes off and the basket value that unlocks it."}
          </p>
          <div className="mt-4">
            <OfferForm offer={editing} />
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
              title="No offers yet"
              description="Create one to give customers a reason to reach a higher basket — for example 50 off orders over 200. It applies at checkout as soon as you save it."
            />
          ) : (
            <OfferList offers={offers} />
          )}
        </section>
      </div>
    </div>
  );
}
