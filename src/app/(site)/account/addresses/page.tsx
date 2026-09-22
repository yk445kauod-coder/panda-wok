import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getMyAddresses } from "@/lib/services/orders";
import { AddressBook } from "@/components/customer/address-book";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";

export const metadata: Metadata = buildMetadata({
  title: "Delivery addresses",
  description: "Manage the addresses Panda Wok delivers to.",
  path: "/account/addresses",
  noIndex: true,
});

export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in?next=%2Faccount%2Faddresses");

  const [{ next }, addresses] = await Promise.all([
    searchParams,
    getMyAddresses(session.user.id),
  ]);

  const backTo = next?.startsWith("/") && !next.startsWith("//") ? next : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: "Account", path: "/account" },
          { name: "Addresses", path: "/account/addresses" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900">Delivery addresses</h1>
        <p className="mt-1 text-sm text-ink-700/80">
          Add the building, floor and a landmark so the rider can find you quickly.
        </p>
      </header>

      {backTo ? (
        <p className="mt-3 rounded-xl bg-rice-200/70 px-3.5 py-2.5 text-xs text-ink-800">
          You came from checkout.{" "}
          <Link href={backTo} className="font-medium text-plum-600 hover:text-plum-700">
            Go back and finish your order
          </Link>
          .
        </p>
      ) : null}

      <AddressBook addresses={addresses} />
    </div>
  );
}
