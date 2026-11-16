import { Suspense } from "react";
import type { Metadata } from "next";
import { AddressesPage } from "@/components/customer/addresses-page";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings } from "@/lib/services/catalog";
import { localePath } from "@/lib/i18n/config";
import { staticLocale, staticT } from "@/lib/i18n/static";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const t = staticT(locale);
  const settings = await getPublicSettings();
  return buildMetadata({
    title: t("addresses.metaTitle"),
    description: t("addresses.metaDescription", { brand: settings.brand.name }),
    path: localePath(locale, "/account/addresses"),
    noIndex: true,
    locale,
  });
}

/**
 * Static shell. The `next` query is read on the client, so the shell wraps the
 * page in Suspense (`useSearchParams` suspends) and the Worker serves a
 * constant document.
 */
export default function Page() {
  return (
    <Suspense>
      <AddressesPage />
    </Suspense>
  );
}
