import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getMyAddresses } from "@/lib/services/orders";
import { getPublicSettings } from "@/lib/services/catalog";
import { AddressBook } from "@/components/customer/address-book";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, settings] = await Promise.all([getLocale(), getPublicSettings()]);
  const t = await getT(locale);
  return buildMetadata({
    title: t("addresses.metaTitle"),
    description: t("addresses.metaDescription", { brand: settings.brand.name }),
    path: "/account/addresses",
    noIndex: true,
    locale,
  });
}

export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in?next=%2Faccount%2Faddresses");

  const [{ next }, addresses, locale] = await Promise.all([
    searchParams,
    getMyAddresses(session.user.id),
    getLocale(),
  ]);
  const t = await getT(locale);

  const backTo = next?.startsWith("/") && !next.startsWith("//") ? next : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.account"), path: "/account" },
          { name: t("account.addresses"), path: "/account/addresses" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900">{t("addresses.title")}</h1>
        <p className="mt-1 text-sm text-ink-700/80">{t("addresses.subtitle")}</p>
      </header>

      {backTo ? (
        <p className="mt-3 rounded-xl bg-rice-200/70 px-3.5 py-2.5 text-xs text-ink-800">
          {t("addresses.cameFromCheckout")}{" "}
          <Link href={backTo} className="font-medium text-indigo-600 hover:text-indigo-700">
            {t("addresses.backToCheckout")}
          </Link>
          .
        </p>
      ) : null}

      <AddressBook addresses={addresses} />
    </div>
  );
}
