import type { Metadata } from "next";
import {
  Fraunces,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Arabic,
  Shippori_Mincho,
} from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/seo/metadata";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/components/i18n-provider";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { getPublicSettings } from "@/lib/services/catalog";
import { dirFor } from "@/lib/i18n/config";

/**
 * Fonts are the site's heaviest resource. Google's Arabic and CJK faces are
 * split into many unicode-range chunks, and `next/font` emits a <link
 * rel=preload> for every chunk of every weight — five families produced 327
 * preload tags on the home page, so the browser raced to download hundreds of
 * files before first paint.
 *
 * Only the Latin body face is preloaded now. The rest set `preload: false`:
 * they keep their @font-face and unicode-range, so a face still loads the
 * moment copy actually uses it, but nothing is fetched up front. Weights are
 * trimmed to the ones the design system asks for.

 *
 * The brand face is IBM Plex in both scripts: `IBM_Plex_Sans` for Latin,
 * `IBM_Plex_Sans_Arabic` for Arabic. Same family, one voice — the display slot
 * stays a notch heavier (600/700 Latin, 500/700 Arabic)for headings, and
 * Shippori Mincho covers CJK glyphs inline.

 */
const bodyFont = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/**
 * Display face. Fraunces is a soft, high-contrast old-style serif: at display
 * sizes it reads editorial and a little hand-cut, which is the register the
 * hero and section headings want. Body copy stays IBM Plex Sans, so the two
 * roles are unmistakably different rather than one sans doing both jobs.
 *
 * It is not preloaded (the hero is the only place it paints above the fold and
 * the layout already preloads the body face); `preload: false` keeps the
 * initial request count down.
 */
const displayFont = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  preload: false,
});

/** Arabic needs a typeface with real Arabic coverage; Inter has none. */
const arabicFont = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});

/**
 * Arabic display face for headings only. Plex Arabic SemiBold sits a notch
 * heavier than the body weights, which gives Arabic headings the same
 * "display vs body" contrast Latin gets from Plex SemiBold vs Plex Regular.
 * None of the contrast comes from switching families anymore. One Plex
 * voice in both scripts.
 */
const arabicDisplayFont = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic-display",
  subsets: ["arabic"],
  weight: ["500", "700"],
  display: "swap",
  preload: false,
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
  weight: ["400", "600"],
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getT(locale);
  const settings = await getPublicSettings().catch(() => null);
  const brandName = settings?.brand.name ?? "Panda Wok";
  const brandCity = settings?.brand.city ?? "Alexandria";

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: t("home.metaTitle", {
        brand: brandName,
        tagline: settings?.brand.tagline ?? "",
      }),
      template: `%s | ${brandName}`,
    },
    description: t("home.metaDescription", {
      tagline: settings?.brand.tagline ?? "",
      brand: brandName,
      city: brandCity,
    }),
    applicationName: brandName,
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
