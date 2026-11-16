"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { useLocalePath } from "@/components/i18n-hooks";
import { usePublicData } from "@/lib/public/client";
import { PageLoading } from "@/components/ui/page-states";
import { AddressBook } from "@/components/customer/address-book";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { Reveal } from "@/components/ui/reveal";
import type { Address } from "@/lib/services/orders";

type AddressesData = {
  addresses: Address[];
};

/**
 * Address book, resolved on the client.
 *
 * The server page awaited the session before it could render; the shell is a
 * constant now and the browser asks `/api/public/me/addresses`. A 401 becomes
 * the sign-in redirect the server page used to perform.
 */
export function AddressesPage() {
  const { t } = useI18n();
  const lp = useLocalePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const signInHref = `/auth/sign-in?next=${encodeURIComponent(lp("/account/addresses"))}`;
  const { data, loading } = usePublicData<AddressesData>(
    "/api/public/me/addresses",
    undefined,
    { onUnauthorized: () => router.replace(signInHref) },
  );

  if (loading && !data) return <PageLoading />;
  if (!data) return null;

  const addresses = data.addresses;

  const backTo = next?.startsWith("/") && !next.startsWith("//") ? next : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.account"), path: lp("/account") },
          { name: t("account.addresses"), path: lp("/account/addresses") },
        ]}
      />

      <Reveal as="header" className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900">{t("addresses.title")}</h1>
        <p className="mt-1 text-sm text-ink-700/80">{t("addresses.subtitle")}</p>
      </Reveal>

      {backTo ? (
        <p className="mt-3 rounded-xl bg-rice-200/70 px-3.5 py-2.5 text-xs text-ink-800">
          {t("addresses.cameFromCheckout")}{" "}
          <Link href={backTo} className="font-medium text-vermilion-600 hover:text-vermilion-700">
            {t("addresses.backToCheckout")}
          </Link>
          .
        </p>
      ) : null}

      <Reveal delay={80}><AddressBook addresses={addresses} /></Reveal>
    </div>
  );
}
