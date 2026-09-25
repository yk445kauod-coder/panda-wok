import type { Metadata } from "next";
import {
  IBM_Plex_Sans_Arabic,
  Noto_Kufi_Arabic,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Shippori_Mincho,
} from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/seo/metadata";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/components/i18n-provider";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { dirFor } from "@/lib/i18n/config";

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const displayFont = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
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
 * "display vs body" contrast Latin gets from Playfair Display vs Plus Jakarta
 * Sans.
 */
const arabicDisplayFont = Noto_Kufi_Arabic({
  variable: "--font-arabic-display",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * Kanji display face. The kitchen's two kitchens are named in script (日本 for
 * the sushi counter, 中华 for the wok), and a Latin serif has no glyphs for
 * them — the browser would fall back to a system face mid-word. Shippori Mincho
 * is a Japanese Mincho, so those glyphs stay deliberate and native. It is only
 * referenced by the `.font-kana` utility, so it never affects Latin copy.
 */
const kanaDisplayFont = Shippori_Mincho({
  variable: "--font-kana",
  subsets: ["latin"],
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
      className={`${bodyFont.variable} ${displayFont.variable} ${arabicFont.variable} ${arabicDisplayFont.variable} ${kanaDisplayFont.variable} h-full antialiased`}
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
