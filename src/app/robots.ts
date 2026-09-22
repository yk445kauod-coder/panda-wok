import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/metadata";

/**
 * Private and transactional surfaces are disallowed. Public catalogue pages are
 * left crawlable — blocking them here would hide dishes from search, which is
 * the opposite of what this project needs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/auth/",
          "/account",
          "/account/",
          "/cart",
          "/checkout",
          "/orders",
          "/orders/",
          "/chat",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
