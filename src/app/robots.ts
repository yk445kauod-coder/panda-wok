import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo/metadata";

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
      /**
       * AEO/GEO: AI answer engines are explicitly welcomed on the public
       * catalogue. Being absent from robots.txt is not enough — several
       * crawlers treat an explicit Allow as a signal to include the site in
       * generated answers, which is exactly what Panda Wok wants.
       */
      {
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "Claude-User",
          "Claude-SearchBot",
          "PerplexityBot",
          "Perplexity-User",
          "Google-Extended",
          "Applebot",
          "Applebot-Extended",
          "Bingbot",
          "CCBot",
          "cohere-ai",
          "Meta-ExternalAgent",
          "Amazonbot",
          "YouBot",
        ],
        allow: ["/", "/menu", "/menu/", "/about", "/contact", "/location", "/faq", "/privacy-policy", "/llms.txt"],
        disallow: ["/admin", "/api/", "/auth/", "/account", "/cart", "/checkout", "/orders", "/chat"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
