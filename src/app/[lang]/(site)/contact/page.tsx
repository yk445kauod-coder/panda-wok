import type { Metadata } from "next";
import { ContactPage } from "@/components/customer/contact-page";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings } from "@/lib/services/catalog";
import { localePath } from "@/lib/i18n/config";
import { staticLocale } from "@/lib/i18n/static";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const settings = await getPublicSettings();
  return buildMetadata({
    title: `Contact ${settings.brand.name}`,
    description: `Reach ${settings.brand.name} in ${settings.brand.city} to ask about an order, an allergen or delivery to your area.`,
    path: localePath(locale, "/contact"),
    siteName: settings.brand.name,
  });
}

/** Static shell; the details arrive from the client store. */
export default function Page() {
  return <ContactPage />;
}
