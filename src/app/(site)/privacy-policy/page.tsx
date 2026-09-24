import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings } from "@/lib/services/catalog";
import { getPageContent } from "@/lib/services/content";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * When staff publish a privacy policy through the CMS it is rendered here.
 * Until then the page states that honestly rather than presenting a
 * placeholder as a legal document.
 */
const PRIVACY_PAGE_KEY = "privacy";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([getPublicSettings(), getLocale()]);
  const t = await getT(locale);
  return buildMetadata({
    title: t("legal.privacy.metaTitle", { brand: settings.brand.name }),
    description: t("legal.privacy.metaDescription", { brand: settings.brand.name }),
    path: "/privacy-policy",
    siteName: settings.brand.name,
    locale,
  });
}

export default async function PrivacyPolicyPage() {
  const locale = await getLocale();
  const t = await getT(locale);
  const sections = await getPageContent(PRIVACY_PAGE_KEY, locale);

  const structured = [
    breadcrumbSchema([
      { name: t("common.home"), path: "/" },
      { name: t("legal.privacy.title"), path: "/privacy-policy" },
    ]),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.home"), path: "/" },
          { name: t("legal.privacy.title"), path: "/privacy-policy" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
          {t("legal.privacy.title")}
        </h1>
      </header>

      {sections.length === 0 ? (
        <section className="washi-panel mt-5 p-4">
          <p className="text-sm text-ink-700/85">{t("legal.privacy.pending")}</p>
          <Link
            href="/contact"
            className="mt-3 inline-flex h-10 items-center rounded-xl border border-ink-900/15 px-4 text-sm font-medium text-ink-900 hover:bg-rice-200"
          >
            {t("legal.privacy.contactLink")}
          </Link>
        </section>
      ) : (
        <div className="mt-5 space-y-4">
          {sections.map((section) => (
            <section key={section.sectionKey} className="washi-panel p-4">
              {section.heading ? (
                <h2 className="text-base font-semibold text-ink-900">{section.heading}</h2>
              ) : null}
              {section.body ? (
                <p className="mt-2 whitespace-pre-line text-sm text-ink-700/85">
                  {section.body}
                </p>
              ) : null}
            </section>
          ))}
        </div>
      )}

      <JsonLdScript data={structured} />
    </div>
  );
}
