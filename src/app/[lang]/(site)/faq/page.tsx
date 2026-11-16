import type { Metadata } from "next";
import { FaqPage } from "@/components/customer/faq-page";
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
    title: t("faq.metaTitle", {
      brand: settings.brand.name,
      city: settings.brand.city,
    }),
    description: t("faq.metaDescription", { brand: settings.brand.name }),
    path: localePath(locale, "/faq"),
    siteName: settings.brand.name,
    locale,
  });
}

/** Static shell; the Q&A arrives from the client store. */
export default function Page() {
  return <FaqPage />;
}
