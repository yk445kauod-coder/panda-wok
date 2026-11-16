import type { Metadata } from "next";
import { PrivacyPage } from "@/components/customer/privacy-page";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings } from "@/lib/services/catalog";
import { localePath } from "@/lib/i18n/config";
import { staticLocale, staticT } from "@/lib/i18n/static";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [{ lang }, settings] = await Promise.all([params, getPublicSettings()]);
  const locale = staticLocale(lang);
  const t = staticT(locale);
  return buildMetadata({
    title: t("legal.privacy.metaTitle", { brand: settings.brand.name }),
    description: t("legal.privacy.metaDescription", { brand: settings.brand.name }),
    path: localePath(locale, "/privacy-policy"),
    siteName: settings.brand.name,
    locale,
  });
}

/** Static shell; the copy arrives from the client store and content API. */
export default function Page() {
  return <PrivacyPage />;
}
