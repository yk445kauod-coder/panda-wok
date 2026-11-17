import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartProvider } from "@/components/customer/cart-provider";
import { StoreDataProvider } from "@/components/customer/store-data";
import { PageEnter } from "@/components/layout/page-enter";
import { SiteChrome } from "@/components/layout/site-chrome";
import { ViewerProvider } from "@/components/layout/viewer-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { DocumentLocale } from "@/components/layout/document-locale";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { dirFor, isLocale, LOCALES, type Locale } from "@/lib/i18n/config";
import { staticDictionary } from "@/lib/i18n/static";

/**
 * The customer shell is a static document.
 *
 * It used to read the feature flags, the public settings and the restaurant row
 * on the Worker and render the header, footer and structured data from them, so
 * every page view paid for a server render plus a catalogue read — the cost that
 * pushed the Free plan past its 10 ms CPU budget. The layout now renders only
 * the dictionary and the `dir`, both known from the URL, and the brand, contact
 * links and flags arrive from the client store (`StoreDataProvider`) after
 * paint. The structured data moved into `StructuredData`, a client component,
 * for the same reason.
 */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale = localeFrom(lang);
  return {
    title: {
      template: `%s | Panda Wok`,
      default: locale === "ar" ? "باندا ووك" : "Panda Wok",
    },
    alternates: { languages: { en: "/en", ar: "/ar" } },
  };
}

function localeFrom(lang: string): Locale {
  return (LOCALES as readonly string[]).includes(lang) ? (lang as Locale) : "en";
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const locale: Locale = lang;
  const dict = staticDictionary(locale);

  return (
    <I18nProvider locale={locale} dict={dict}>
      <DocumentLocale locale={locale} />
      <ToastProvider>
        <ConfirmProvider>
          <StoreDataProvider locale={locale}>
            <ViewerProvider>
                <CartProvider>
                  <div dir={dirFor(locale)} lang={locale} data-locale={locale} className="contents">
                    <div className="flex min-h-dvh flex-col">
                      <SiteChrome locale={locale} />
                      <main id="main" className="flex-1 pb-24 md:pb-0">
                        <PageEnter>{children}</PageEnter>
                      </main>
                    </div>
                  </div>
                </CartProvider>
            </ViewerProvider>
          </StoreDataProvider>
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
