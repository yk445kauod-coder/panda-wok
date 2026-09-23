import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, MapPin, MessageSquare, Package, Receipt, Star, Wallet } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getMyStats, getMyOrders, getMyAddresses } from "@/lib/services/orders";
import { getLoyaltyOverview } from "@/lib/services/loyalty";
import { getFeatureFlagMap, getPublicSettings } from "@/lib/services/catalog";
import { Badge } from "@/components/ui/button";
import { SignOutButton } from "@/components/customer/sign-out-button";
import { ProfileForm } from "@/components/customer/profile-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { statusLabel } from "@/lib/i18n/orders";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, settings] = await Promise.all([getLocale(), getPublicSettings()]);
  const t = await getT(locale);
  return buildMetadata({
    title: t("account.metaTitle"),
    description: t("account.metaDescription", { brand: settings.brand.name }),
    path: "/account",
    noIndex: true,
    locale,
  });
}

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in?next=%2Faccount");

  const locale = await getLocale();
  const t = await getT(locale);

  const [stats, orders, addresses, loyalty, flags] = await Promise.all([
    getMyStats(session.user.id),
    getMyOrders(session.user.id, 3),
    getMyAddresses(session.user.id),
    getLoyaltyOverview(session.user.id),
    getFeatureFlagMap(),
  ]);

  const profile = session.profile;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {profile?.full_name
              ? t("account.hello", { name: profile.full_name.split(" ")[0] })
              : t("account.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {t("account.memberSince", { date: formatDate(profile?.created_at, locale) })}
            {session.isStaff ? t("account.staffAccount") : ""}
          </p>
        </div>
        <LanguageSwitcher current={locale} />
      </header>

      {profile?.is_blocked ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3.5 text-sm text-chili-600"
        >
          {t("account.blockedNotice")}
        </p>
      ) : null}

      <section aria-labelledby="stats-heading" className="mt-5">
        <h2 id="stats-heading" className="sr-only">
          {t("account.statsHeading")}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={Receipt}
            label={t("account.statOrders")}
            value={String(stats.orderCount)}
          />
          <StatCard
            icon={Wallet}
            label={t("account.statLifetimeSpend")}
            value={formatPrice(stats.lifetimeSpend, undefined, locale)}
          />
          <StatCard
            icon={Package}
            label={t("account.statActiveOrders")}
            value={String(stats.activeOrders)}
          />
          {flags.loyalty !== false ? (
            <StatCard
              icon={Award}
              label={t("account.statLoyaltyPoints")}
              value={String(loyalty.account?.points_balance ?? 0)}
              href="/loyalty"
            />
          ) : null}
        </dl>
      </section>

      {/* Active order shortcut */}
      {orders.some((o) =>
        ["new", "accepted", "in_progress", "prepared", "out_for_delivery"].includes(o.status),
      ) ? (
        <section aria-labelledby="active-heading" className="washi-panel mt-5 p-4">
          <h2 id="active-heading" className="text-sm font-semibold text-ink-900">
            {t("account.trackOrder")}
          </h2>
          <ul className="mt-3 space-y-2">
            {orders
              .filter((o) =>
                ["new", "accepted", "in_progress", "prepared", "out_for_delivery"].includes(
                  o.status,
                ),
              )
              .map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink-900/10 px-3 py-2.5 hover:bg-rice-200/60"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-900">
                        #{order.order_number}
                      </span>
                      <span className="block text-xs text-ink-700/70">
                        {order.item_count === 1
                          ? t("orders.itemCountSingular", { count: order.item_count })
                          : t("orders.itemCountPlural", { count: order.item_count })}{" "}
                        · {formatPrice(order.total, undefined, locale)}
                      </span>
                    </span>
                    <Badge tone="info">{statusLabel(order.status, locale)}</Badge>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {/* Profile */}
      <section aria-labelledby="profile-heading" className="washi-panel mt-5 p-4">
        <h2 id="profile-heading" className="text-sm font-semibold text-ink-900">
          {t("account.detailsHeading")}
        </h2>
        <ProfileForm
          defaults={{
            fullName: profile?.full_name ?? "",
            phone: profile?.phone ?? "",
            marketingOptIn: profile?.marketing_opt_in ?? false,
            notificationsOptIn: profile?.notifications_opt_in ?? false,
          }}
        />
      </section>

      {/* Addresses */}
      <section aria-labelledby="addresses-heading" className="washi-panel mt-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="addresses-heading"
            className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
          >
            <MapPin className="size-4 text-plum-600" aria-hidden="true" />
            {t("account.addressesHeading")}
          </h2>
          <Link
            href="/account/addresses"
            className="text-xs font-medium text-plum-600 hover:text-plum-700"
          >
            {t("common.manage")}
          </Link>
        </div>
        {addresses.length === 0 ? (
          <p className="mt-3 text-sm text-ink-700/75">{t("account.noAddresses")}</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {addresses.slice(0, 3).map((address) => (
              <li key={address.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium text-ink-900">{address.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-700/75">
                    {[address.address_line, address.building, address.landmark]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {address.is_default ? (
                  <Badge tone="info">{t("common.default")}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Shortcuts */}
      <nav aria-label={t("account.shortcuts")} className="mt-5 grid grid-cols-2 gap-3">
        <ShortcutLink href="/orders" icon={Receipt} label={t("account.yourOrders")} />
        <ShortcutLink
          href="/account/addresses"
          icon={MapPin}
          label={t("account.addresses")}
        />
        {flags.loyalty !== false ? (
          <ShortcutLink href="/loyalty" icon={Star} label={t("common.loyalty")} />
        ) : null}
        {flags.feedback !== false ? (
          <ShortcutLink href="/feedback" icon={MessageSquare} label={t("common.feedback")} />
        ) : null}
      </nav>

      <div className="mt-5">
        <SignOutButton />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <dt className="flex items-center gap-1.5 text-xs text-ink-700/70">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-ink-900 tabular-nums">{value}</dd>
    </>
  );

  return href ? (
    <Link href={href} className="washi-panel p-3 transition-shadow hover:shadow-washi-lg">
      {content}
    </Link>
  ) : (
    <div className="washi-panel p-3">{content}</div>
  );
}

function ShortcutLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Receipt;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="washi-panel flex items-center gap-2.5 p-3.5 text-sm font-medium text-ink-900 transition-shadow hover:shadow-washi-lg"
    >
      <Icon className="size-4 text-plum-600" aria-hidden="true" />
      {label}
    </Link>
  );
}
