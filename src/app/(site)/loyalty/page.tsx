import type { Metadata } from "next";
import Link from "next/link";
import { Award, Gift, Sparkles, TrendingUp } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getLoyaltyOverview } from "@/lib/services/loyalty";
import { getEnabledRewards, getPublicSettings } from "@/lib/services/catalog";
import { getFeatureFlagMap } from "@/lib/services/catalog";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatNumber, humanise } from "@/lib/utils/format";

/** Sum of redeemed points, derived from the ledger rather than a cached column. */
function redeemedPoints(transactions: { type: string; points: number }[]): number {
  return Math.abs(
    transactions
      .filter((t) => t.type === "redeem")
      .reduce((sum, t) => sum + t.points, 0),
  );
}

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  return buildMetadata({
    title: "Loyalty",
    description: `Earn points on every ${settings.brand.name} order and turn them into rewards.`,
    path: "/loyalty",
    siteName: settings.brand.name,
  });
}

export default async function LoyaltyPage() {
  const [session, flags, settings, rewards] = await Promise.all([
    getSession(),
    getFeatureFlagMap(),
    getPublicSettings(),
    getEnabledRewards(),
  ]);

  if (flags.loyalty === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title="Loyalty is currently switched off"
          description="Our loyalty programme is paused right now. Please check back soon."
        />
      </div>
    );
  }

  const overview = session ? await getLoyaltyOverview(session.user.id) : null;
  const account = overview?.account ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Loyalty", path: "/loyalty" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">Loyalty</h1>
        <p className="mt-1.5 text-sm text-ink-700/85">
          Every order earns points. Points become rewards you can spend on your next meal.
        </p>
      </header>

      {!session ? (
        <section className="washi-panel mt-5 p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Join the programme
          </h2>
          <p className="mt-1.5 text-sm text-ink-700/85">
            {formatNumber(settings.loyalty.pointsPerCurrency)} point
            {settings.loyalty.pointsPerCurrency === 1 ? "" : "s"} for every EGP spent. Points accumulate on your
            account and can be redeemed at checkout.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/auth/sign-up?next=%2Floyalty"
              className="inline-flex h-11 items-center rounded-xl bg-plum-600 px-5 text-sm font-medium text-rice-50 hover:bg-plum-700"
            >
              Create an account
            </Link>
            <Link
              href="/auth/sign-in?next=%2Floyalty"
              className="inline-flex h-11 items-center rounded-xl border border-ink-900/15 px-5 text-sm font-medium text-ink-900 hover:bg-rice-200"
            >
              Sign in
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="balance-heading" className="washi-panel mt-5 p-5">
            <h2 id="balance-heading" className="sr-only">
              Your points
            </h2>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-ink-700/75">Your points balance</p>
                <p className="font-display text-4xl font-semibold text-ink-900 tabular-nums">
                  {formatNumber(account?.points_balance ?? 0)}
                </p>
                <p className="mt-1 text-xs text-ink-700/70">
                  Worth about{" "}
                  {formatNumber((account?.points_balance ?? 0) * settings.loyalty.pointValue)}{" "}
                  EGP off
                </p>
              </div>
              <Badge tone="plum">
                <Award className="size-3.5" aria-hidden="true" />
                {humanise(account?.tier ?? "bronze")}
              </Badge>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-rice-200/60 p-3">
                <dt className="text-xs text-ink-700/70">Lifetime points</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink-900 tabular-nums">
                  {formatNumber(account?.lifetime_points ?? 0)}
                </dd>
              </div>
              <div className="rounded-xl bg-rice-200/60 p-3">
                <dt className="text-xs text-ink-700/70">Points used</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink-900 tabular-nums">
                  {formatNumber(redeemedPoints(overview?.transactions ?? []))}
                </dd>
              </div>
            </dl>

            {overview?.nextTier ? (
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-ink-700/80">
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingUp className="size-3.5" aria-hidden="true" />
                    {formatNumber(overview.nextTier.remaining)} points to{" "}
                    {humanise(overview.nextTier.tier)}
                  </span>
                  <span>{overview.progressPercent}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={overview.progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progress towards ${overview.nextTier.tier}`}
                  className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink-900/10"
                >
                  <div
                    className="h-full rounded-full bg-plum-600 transition-[width] duration-700"
                    style={{ width: `${overview.progressPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-5 inline-flex items-center gap-1.5 text-sm text-miso-600">
                <Sparkles className="size-4" aria-hidden="true" />
                You are on our highest tier. Thank you for ordering with us.
              </p>
            )}
          </section>

          {/* Rewards */}
          <section aria-labelledby="rewards-heading" className="mt-6">
            <h2
              id="rewards-heading"
              className="flex items-center gap-1.5 text-lg font-semibold text-ink-900"
            >
              <Gift className="size-4 text-plum-600" aria-hidden="true" />
              Rewards
            </h2>

            {rewards.length === 0 ? (
              <EmptyState
                className="mt-3"
                title="No rewards published yet"
                description="The kitchen has not published any rewards. Your points still accumulate."
              />
            ) : (
              <ul className="mt-3 space-y-3">
                {rewards.map((reward) => {
                  const affordable = (account?.points_balance ?? 0) >= reward.points_cost;
                  return (
                    <li key={reward.id} className="washi-panel flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink-900">
                            {reward.name_en}
                          </span>
                          {reward.tier_required !== "bronze" ? (
                            <Badge tone="info">
                              {humanise(reward.tier_required)}+
                            </Badge>
                          ) : null}
                        </div>
                        {reward.description_en ? (
                          <p className="mt-1 text-sm text-ink-700/80">
                            {reward.description_en}
                          </p>
                        ) : null}
                        {reward.valid_until ? (
                          <p className="mt-1 text-xs text-ink-700/60">
                            Available until {formatDate(reward.valid_until)}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-ink-900 tabular-nums">
                          {formatNumber(reward.points_cost)}
                        </p>
                        <p className="text-[11px] text-ink-700/65">points</p>
                        <p
                          className={
                            affordable
                              ? "mt-1 text-[11px] font-medium text-jade-600"
                              : "mt-1 text-[11px] text-ink-700/55"
                          }
                        >
                          {affordable ? "Available" : "Keep earning"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-3 text-xs text-ink-700/70">
              Rewards are applied at checkout, where your balance is verified on the
              server.
            </p>
          </section>

          {/* History */}
          <section aria-labelledby="history-heading" className="mt-6">
            <h2 id="history-heading" className="text-lg font-semibold text-ink-900">
              Points history
            </h2>
            {!overview || overview.transactions.length === 0 ? (
              <EmptyState
                className="mt-3"
                title="No points activity yet"
                description="Your first order will start your points history."
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {overview.transactions.map((transaction) => (
                  <li
                    key={transaction.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ink-900/10 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink-900">
                        {transaction.reason ?? humanise(transaction.type)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-700/65">
                        {formatDate(transaction.created_at)}
                      </p>
                    </div>
                    <span
                      className={
                        transaction.points > 0
                          ? "shrink-0 text-sm font-semibold text-jade-600 tabular-nums"
                          : "shrink-0 text-sm font-semibold text-ink-700 tabular-nums"
                      }
                    >
                      {transaction.points > 0 ? "+" : ""}
                      {formatNumber(transaction.points)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <JsonLdLoyaltyNote brand={settings.brand.name} />
    </div>
  );
}

/**
 * Loyalty is not a search destination, but a short FAQ block is genuinely
 * useful for the few real questions customers ask.
 */
function JsonLdLoyaltyNote({ brand }: { brand: string }) {
  return (
    <p className="mt-6 text-xs leading-relaxed text-ink-700/60">
      {brand} loyalty points are awarded per completed order, never on canceled or
      refunded orders. Points expire only if the programme is retired, and we will tell
      you before that happens.
    </p>
  );
}
