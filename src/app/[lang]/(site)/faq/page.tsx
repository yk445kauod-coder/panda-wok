import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { breadcrumbSchema, faqPageSchema } from "@/lib/seo/schema";
import { buildFaq } from "@/lib/seo/faq";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { Reveal } from "@/components/ui/reveal";
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

/**
 * Public FAQ. It answers the questions a first-time customer actually asks, and
 * every number in the answers is read from the kitchen's live settings, so the
 * page cannot contradict checkout. The same Q&A pairs are emitted as FAQPage
 * structured data — the markup mirrors visible text, never adds to it.
 */
export default async function FaqPage({ params }: PageProps) {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const t = staticT(locale);
  const [settings, restaurant] = await Promise.all([
    getPublicSettings(),
    getRestaurant(),
  ]);

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
            href={localePath(locale, "/contact")}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-ink-900/15 px-5 text-sm font-medium text-ink-900 hover:bg-rice-200"
          >
            {t("faq.contactLink")}
          </Link>
          <Link
            href={localePath(locale, "/menu")}
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
