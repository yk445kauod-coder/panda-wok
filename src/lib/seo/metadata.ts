import type { Metadata } from "next";
import { publicEnv } from "@/lib/config/env";

/**
 * Resolves the public origin at request time.
 *
 * This deliberately is a function, not a module-level constant. ES module
 * imports are evaluated before OpenNext's `init()` runs, and `init()` is what
 * copies the Cloudflare bindings into `process.env`. A top-level constant
 * therefore reads the build-time value baked in from `.env.local` — which is
 * how a local build shipped `http://localhost:3000` into every canonical URL
 * and the sitemap. Reading inside the call happens after the bindings exist.
 */
export function siteUrl(): string {
  // Computed lookup on purpose: `process.env.NEXT_PUBLIC_SITE_URL` would be
  // statically replaced by the bundler, which is exactly the bug being fixed.
  // OpenNext assigns the Cloudflare bindings into process.env unconditionally
  // before falling back to the compiled copies, so reading through a variable
  // key yields the real deployment origin.
  const fromRuntime = process.env["NEXT_PUBLIC_SITE_URL"];
  const raw = fromRuntime || publicEnv.NEXT_PUBLIC_SITE_URL;
  return raw.replace(/\/$/, "");
}

export function absoluteUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${siteUrl()}${path}`;
}

export type SeoInput = {
  title: string;
  description: string;
  path: string;
  /** Images must be absolute for Open Graph consumers. */
  image?: string | null;
  imageAlt?: string | null;
  keywords?: string[];
  type?: "website" | "article";
  publishedTime?: string | null;
  noIndex?: boolean;
  locale?: string;
  siteName?: string;
};

/**
 * Builds a complete metadata object: canonical URL, Open Graph, Twitter card
 * and robots directives. Every public page goes through this so no page is
 * left without a canonical or with a duplicated title.
 */
export function buildMetadata(input: SeoInput): Metadata {
  const canonical = absoluteUrl(input.path);
  const image = input.image ?? absoluteUrl("/opengraph-image");

  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: {
      canonical,
    },
    robots: input.noIndex
      ? { index: false, follow: false, nocache: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type: input.type ?? "website",
      url: canonical,
      title: input.title,
      description: input.description,
      siteName: input.siteName ?? "Panda Wok",
      locale: input.locale ?? "en_EG",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: input.imageAlt ?? input.title,
        },
      ],
      ...(input.type === "article" && input.publishedTime
        ? { publishedTime: input.publishedTime }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}
