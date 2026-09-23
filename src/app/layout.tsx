import type { Metadata } from "next";
import { Fraunces, Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/seo/metadata";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/components/i18n-provider";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { dirFor } from "@/lib/i18n/config";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const displayFont = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

/** Arabic needs a typeface with real Arabic coverage; Inter has none. */
const arabicFont = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getT(locale);

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: t("home.metaTitle", { brand: "Panda Wok", city: "Alexandria" }),
      template: "%s | Panda Wok",
    },
    description: t("home.metaDescription", {
      tagline:
        "Panda Wok is a cloud kitchen in Alexandria, Egypt, cooking Asian-inspired wok, ramen and sushi to order.",
      brand: "Panda Wok",
      city: "Alexandria",
    }),
    applicationName: "Panda Wok",
    manifest: "/manifest.webmanifest",
    formatDetection: { telephone: true, address: false, email: true },
    alternates: { canonical: "/" },
  };
}

export const viewport = {
  themeColor: "#f8f4e9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${bodyFont.variable} ${displayFont.variable} ${arabicFont.variable} h-full antialiased`}
      data-locale={locale}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} dict={dict}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
