import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/seo/metadata";

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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Panda Wok — Asian kitchen in Alexandria",
    template: "%s | Panda Wok",
  },
  description:
    "Panda Wok is a cloud kitchen in Alexandria, Egypt, cooking Asian-inspired wok, ramen and sushi to order.",
  applicationName: "Panda Wok",
  formatDetection: { telephone: true, address: false, email: true },
};

export const viewport = {
  themeColor: "#f8f4e9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
