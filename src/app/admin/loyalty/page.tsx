import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { listRewards } from "@/lib/services/admin-catalog";
import { listCrmCustomers, segmentOverview } from "@/lib/crm/customers";
import { AdminForm, Field, TextArea, Toggle } from "@/components/admin/form-kit";
import { saveRewardAction } from "@/lib/actions/admin";
import { RewardRowActions } from "@/components/admin/reward-row-actions";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AdjustPointsForm } from "@/components/admin/customer-controls";
import { formatDateTime, formatNumber, humanise } from "@/lib/utils/format";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type LoyaltyTier = Database["public"]["Enums"]["loyalty_tier"];
type Transaction = Database["public"]["Tables"]["loyalty_transactions"]["Row"];

/**
 * Loyalty centre. The earning rules are read from the settings table, so the
 * "1 order = X points" ratio is editable by the operator rather than coded in.
 */
export default async function AdminLoyaltyPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireCapability("loyalty.manage");
  const params = await searchParams;

  const supabase = await createServerSupabase();

  const [rewards, customers, segments, accounts, transactions, settings] = await Promise.all([
    listRewards(),
    listCrmCustomers({ limit: 200 }).catch(() => []),
    segmentOverview().catch(() => []),
    supabase
      .from("loyalty_accounts")
      .select("user_id, points_balance, lifetime_points, tier")
      .order("lifetime_points", { ascending: false })
      .limit(500)
      .then((r) => r.data ?? []),
    supabase
      .from("loyalty_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25)
      .then((r) => (r.data ?? []) as Transaction[]),
    supabase
      .from("settings")
      .select("key, value, description")
      .like("key", "loyalty%")
      .order("key", { ascending: true })
      .then((r) => r.data ?? []),
  ]);

  const members = accounts.length;
  const pointsOutstanding = accounts.reduce((sum, a) => sum + a.points_balance, 0);
  const lifetimeIssued = accounts.reduce((sum, a) => sum + a.lifetime_points, 0);

  const tierCounts = accounts.reduce<Record<string, number>>((acc, account) => {
    acc[account.tier] = (acc[account.tier] ?? 0) + 1;
    return acc;
  }, {});

  const memberSegment = segments.find((segment) => segment.segment === "loyalty_members");
  const redeemable = customers.filter((customer) => customer.points_balance > 0);

  const editing = params.edit
    ? rewards.find((reward) => reward.id === params.edit) ?? null
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Loyalty</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Points, tiers and rewards. Earning rules are settings, not constants, so the
            programme can be retuned without a deployment.
          </p>
        </div>
        <Badge tone="plum">{formatNumber(pointsOutstanding)} points outstanding</Badge>
      </header>

      <section aria-label="Loyalty summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Members" value={formatNumber(members)} hint="Accounts with a loyalty ledger" />
        <Stat
          label="Points outstanding"
          value={formatNumber(pointsOutstanding)}
          hint="Owed to customers right now"
        />
        <Stat label="Lifetime points issued" value={formatNumber(lifetimeIssued)} />
        <Stat
          label="Members holding points"
          value={formatNumber(memberSegment?.count ?? redeemable.length)}
          hint="Able to redeem today"
        />
      </section>

      <section className="washi-panel p-4" aria-label="Tiers">
        <h2 className="font-display text-lg font-semibold text-ink-900">Tiers</h2>
        <p className="mt-1 text-xs text-ink-700/70">
          Tier thresholds are read from the loyalty settings below.
        </p>

        {members === 0 ? (
          <p className="mt-3 text-sm text-ink-700/70">No loyalty members yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(["bronze", "silver", "gold", "platinum"] as LoyaltyTier[]).map((tier) => (
              <li key={tier} className="rounded-xl border border-ink-900/10 bg-rice-50 p-3">
                <p className="text-sm font-medium text-ink-900">{humanise(tier)}</p>
                <p className="mt-0.5 font-display text-xl font-semibold tabular-nums text-ink-900">
                  {formatNumber(tierCounts[tier] ?? 0)}
                </p>
                <p className="text-xs text-ink-700/65">members</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="washi-panel p-4" aria-label="Earning rules">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          Programme settings
        </h2>
        <p className="mt-1 text-xs text-ink-700/70">
          These are the live values the order pipeline reads. Edit them in{" "}
          <a href="/admin/settings" className="font-medium text-plum-600 hover:text-plum-700">
            Settings
          </a>
          .
        </p>

        {settings.length === 0 ? (
          <p className="mt-3 text-sm text-ink-700/70">
            No loyalty settings found. Defaults from the database apply.
          </p>
        ) : (
          <dl className="mt-3 divide-y divide-ink-900/8">
            {settings.map((setting) => (
              <div key={setting.key} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <dt className="text-sm text-ink-900">
                  {humanise(setting.key.replace(/^loyalty\./, "").replace(/\./g, " "))}
                  <span className="ml-2 font-mono text-xs text-ink-700/60">{setting.key}</span>
                </dt>
                <dd className="font-mono text-sm text-ink-800">
                  {typeof setting.value === "string" || typeof setting.value === "number"
                    ? String(setting.value)
                    : JSON.stringify(setting.value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="washi-panel p-4" aria-label="Rewards">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink-900">Rewards</h2>
            <Badge tone="neutral">{rewards.length}</Badge>
          </div>

          {rewards.length === 0 ? (
            <EmptyState
              className="mt-3"
              title="No rewards configured"
              description="Add a reward below so customers have something to redeem their points for."
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {rewards.map((reward) => (
                <li key={reward.id} className="rounded-xl border border-ink-900/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{reward.name_en}</span>
                    {reward.name_ar ? (
                      <span className="text-xs text-ink-700/70" dir="rtl">
                        {reward.name_ar}
                      </span>
                    ) : null}
                    {reward.is_enabled ? (
                      <Badge tone="success">Enabled</Badge>
                    ) : (
                      <Badge tone="neutral">Disabled</Badge>
                    )}
                    <Badge tone="plum">{formatNumber(reward.points_cost)} pts</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-700/70">
                    {humanise(reward.kind)} · value {reward.value}
                    {reward.min_order_total > 0
                      ? ` · min order ${reward.min_order_total} EGP`
                      : ""}
                    {` · ${humanise(reward.tier_required)}+`}
                    {` · redeemed ${reward.redeemed_count} times`}
                    {reward.stock_limit ? ` · limit ${reward.stock_limit}` : ""}
                  </p>
                  {reward.description_en ? (
                    <p className="mt-1 text-xs text-ink-800/80">{reward.description_en}</p>
                  ) : null}
                  <div className="mt-2">
                    <RewardRowActions reward={reward} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="washi-panel p-4" aria-label="Create or edit a reward">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            {editing ? "Edit reward" : "Add a reward"}
          </h2>
          <p className="mt-1 text-xs text-ink-700/70">
            Rewards are granted at redemption after the loyalty ledger confirms the balance.
          </p>
          <div className="mt-3">
            <AdminForm
              key={editing?.id ?? "new"}
              action={saveRewardAction}
              submitLabel={editing ? "Save changes" : "Create reward"}
              options={{
                successMessage: editing ? "Reward updated." : "Reward created.",
              }}
              extraActions={
                editing ? (
                  <Link
                    href="/admin/loyalty"
                    className="inline-flex h-11 items-center rounded-xl border border-ink-900/15 px-4 text-sm text-ink-800 hover:bg-rice-200"
                  >
                    Cancel
                  </Link>
                ) : null
              }
            >
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="nameEn" label="Name (English)" defaultValue={editing?.name_en} />
                <Field
                  name="nameAr"
                  label="Name (Arabic)"
                  defaultValue={editing?.name_ar ?? undefined}
                />
              </div>
              <TextArea
                name="descriptionEn"
                label="Description (English)"
                rows={2}
                defaultValue={editing?.description_en ?? undefined}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="pointsCost"
                  label="Points cost"
                  placeholder="200"
                  defaultValue={editing ? String(editing.points_cost) : undefined}
                />
                <div>
                  <label htmlFor="kind" className="block text-sm font-medium text-ink-900">
                    Kind
                  </label>
                  <select
                    id="kind"
                    name="kind"
                    defaultValue={editing?.kind ?? "free_item"}
                    className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
                  >
                    <option value="free_item">Free item</option>
                    <option value="discount_percent">Percentage discount</option>
                    <option value="discount_amount">Fixed discount (EGP)</option>
                  </select>
                </div>
                <Field
                  name="value"
                  label="Value"
                  hint="EGP, percent or the item id, depending on kind."
                  defaultValue={editing ? String(editing.value) : "0"}
                />
                <Field
                  name="minOrderTotal"
                  label="Minimum order (EGP)"
                  defaultValue={editing ? String(editing.min_order_total) : "0"}
                />
                <div>
                  <label
                    htmlFor="tierRequired"
                    className="block text-sm font-medium text-ink-900"
                  >
                    Minimum tier
                  </label>
                  <select
                    id="tierRequired"
                    name="tierRequired"
                    defaultValue={editing?.tier_required ?? "bronze"}
                    className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
                  >
                    {(["bronze", "silver", "gold", "platinum"] as LoyaltyTier[]).map((tier) => (
                      <option key={tier} value={tier}>
                        {humanise(tier)}
                      </option>
                    ))}
                  </select>
                </div>
                <Field
                  name="stockLimit"
                  label="Stock limit"
                  hint="Optional cap on redemptions."
                  defaultValue={editing?.stock_limit ? String(editing.stock_limit) : undefined}
                />
              </div>
              <Toggle
                name="isEnabled"
                label="Enabled"
                defaultChecked={editing ? editing.is_enabled : true}
              />
            </AdminForm>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="washi-panel p-4" aria-label="Adjust points">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Adjust a balance
          </h2>
          <p className="mt-1 text-xs text-ink-700/70">
            Every adjustment is written to the loyalty ledger with a reason and to the audit
            log with your identity.
          </p>
          <div className="mt-3">
            <AdjustPointsForm
              options={customers.slice(0, 200).map((customer) => ({
                id: customer.user_id,
                name: customer.full_name ?? customer.phone ?? "Unnamed customer",
                points: customer.points_balance,
              }))}
            />
          </div>
        </section>

        <section className="washi-panel p-4" aria-label="Recent ledger activity">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Recent ledger activity
          </h2>

          {transactions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700/70">
              No loyalty transactions recorded yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/8">
              {transactions.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-900">
                      <span
                        className={
                          entry.points >= 0 ? "text-jade-600" : "text-chili-600"
                        }
                      >
                        {entry.points >= 0 ? "+" : ""}
                        {entry.points} pts
                      </span>
                      <span className="text-ink-700/70"> · {humanise(entry.type)}</span>
                    </p>
                    <p className="text-xs text-ink-700/65">
                      {entry.reason ?? "No reason recorded"} ·{" "}
                      {formatDateTime(entry.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="washi-panel p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/75">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink-900">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-700/65">{hint}</p> : null}
    </div>
  );
}
