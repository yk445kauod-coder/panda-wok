"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { useLocalePath } from "@/components/i18n-hooks";
import { useStore } from "@/components/customer/store-data";
import { usePublicData } from "@/lib/public/client";
import { PageLoading } from "@/components/ui/page-states";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import type { PageSection } from "@/lib/services/content";

/**
 * When staff publish a privacy policy through the CMS it is rendered here.
 * Until then the page states that honestly rather than presenting a
 * placeholder as a legal document. The copy is read from `/api/public/content`
 * in the browser now, so the Worker serves a constant document.
 */
const PRIVACY_PAGE_KEY = "privacy";

export function PrivacyPage() {
  const { t } = useI18n();
  const lp = useLocalePath();
  const { data, loading } = useStore();
  const { data: content } = usePublicData<{ sections: PageSection[] }>(
    "/api/public/content",
    { page: PRIVACY_PAGE_KEY, locale: data?.locale },
  );

  if (loading && !data) return <PageLoading />;
  if (!data) return null;

  const sections = content?.sections ?? [];

  const structured = [
    breadcrumbSchema([
      { name: t("common.home"), path: lp("/") },
      { name: t("legal.privacy.title"), path: lp("/privacy-policy") },
    ]),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.home"), path: lp("/") },
          { name: t("legal.privacy.title"), path: lp("/privacy-policy") },
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
            href={lp("/contact")}
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
