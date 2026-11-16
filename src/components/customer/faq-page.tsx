"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { useLocalePath } from "@/components/i18n-hooks";
import { useStore } from "@/components/customer/store-data";
import { PageLoading } from "@/components/ui/page-states";
import { breadcrumbSchema, faqPageSchema } from "@/lib/seo/schema";
import { buildFaq } from "@/lib/seo/faq";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { Reveal } from "@/components/ui/reveal";

/**
 * Public FAQ, rendered from the client store.
 *
 * It answers the questions a first-time customer actually asks, and every
 * number in the answers is read from the kitchen's live settings, so the page
 * cannot contradict checkout. The settings arrive from `/api/public/bootstrap`
 * in the browser now, so the Worker serves a constant document. The same Q&A
 * pairs are emitted as FAQPage structured data — the markup mirrors visible
 * text, never adds to it.
 */
export function FaqPage() {
  const { t } = useI18n();
  const lp = useLocalePath();
  const { data, loading } = useStore();

  if (loading && !data) return <PageLoading />;
  if (!data) return null;

  const { settings, restaurant } = data;
  const faqs = buildFaq(t, settings, restaurant);

  const structured = [
    faqPageSchema(faqs),
    breadcrumbSchema([
      { name: t("common.home"), path: "/" },
      { name: t("faq.title"), path: "/faq" },
    ]),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.home"), path: "/" },
          { name: t("faq.title"), path: "/faq" },
        ]}
      />

      <Reveal className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
          {t("faq.title")}
        </h1>
        <p className="mt-1.5 text-sm text-ink-700/85">{t("faq.subtitle")}</p>
      </Reveal>

      <Reveal delay={80}>
        <dl className="mt-5 space-y-3">
          {faqs.map((faq) => (
            <div key={faq.question} className="washi-panel p-4">
              <dt className="text-sm font-semibold text-ink-900">{faq.question}</dt>
              <dd className="mt-1.5 text-sm text-ink-700/85">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </Reveal>

      <Reveal delay={140}>
        <section className="washi-panel mt-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-800">{t("faq.contactPrompt")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={lp("/contact")}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-ink-900/15 px-5 text-sm font-medium text-ink-900 hover:bg-rice-200"
          >
            {t("faq.contactLink")}
          </Link>
          <Link
            href={lp("/menu")}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-vermilion-600 px-5 text-sm font-medium text-rice-50 hover:bg-vermilion-700"
          >
            {t("faq.seeMenu")}
          </Link>
        </div>
      </section>
      </Reveal>

      <JsonLdScript data={structured} />
    </div>
  );
}
