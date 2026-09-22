import type { Metadata } from "next";
import { publicEnv } from "@/lib/config/env";

export const SITE_URL = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

export function absoluteUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${SITE_URL}${path}`;
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
