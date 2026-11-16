import { Suspense } from "react";
import type { Metadata } from "next";
import { FeedbackPage } from "@/components/customer/feedback-page";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings } from "@/lib/services/catalog";
import { localePath } from "@/lib/i18n/config";
import { staticLocale, staticT } from "@/lib/i18n/static";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const [settings] = await Promise.all([getPublicSettings()]);
  const t = staticT(locale);
  return buildMetadata({
    title: t("feedback.metaTitle"),
    description: t("feedback.metaDescription", { brand: settings.brand.name }),
    path: localePath(locale, "/feedback"),
    siteName: settings.brand.name,
    locale,
  });
}

/**
 * Static shell; feedback reads its data in the browser.
 *
 * `Suspense` is required because `FeedbackPage` reads `useSearchParams()` for
 * the `?order=` deep link.
 */
export default function Page() {
  return (
    <Suspense>
      <FeedbackPage />
    </Suspense>
  );
}
