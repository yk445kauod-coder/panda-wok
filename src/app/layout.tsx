import type { Metadata } from "next";
import {
  Fraunces,
  IBM_Plex_Sans_Arabic,
  Inter,
  Noto_Kufi_Arabic,
} from "next/font/google";
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

/**
 * Arabic display face for headings only. Kufi is a heavier, more geometric
 * script than the Plex body face, which gives Arabic headings the same
 * "display vs body" contrast Latin gets from Fraunces vs Inter.
 */
const arabicDisplayFont = Noto_Kufi_Arabic({
  variable: "--font-arabic-display",
  subsets: ["arabic"],
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
    // Search Console ownership. Emitted as
    // `<meta name="google-site-verification" content="...">` on every document;
    // the same token is also served as a static file at
    // /google469af7ac01566c8d.html for the alternative verification method.
    verification: {
      google: "LD42BDyIchUHWtltC7PZsyUi9oT8mic03JhlOuUL9TU",
    },
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
      className={`${bodyFont.variable} ${displayFont.variable} ${arabicFont.variable} ${arabicDisplayFont.variable} h-full antialiased`}
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
