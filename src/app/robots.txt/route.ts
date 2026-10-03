import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

/**
 * robots.txt as a route handler (instead of MetadataRoute.Robots) so the file
 * can carry Content-Signal directives: those express AI usage preferences to
 * honest crawlers (contentsignals.org / draft-romm-aipref-contentsignals).
 *
 * Public catalogue pages stay crawlable; private and transactional surfaces
 * are disallowed. AEO/GEO crawlers are explicitly welcomed on the public
 * catalogue — several answer engines treat an explicit Allow as a signal.
 */
const AI_AGENTS = [
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
];

const DISALLOW_PRIVATE = [
  "/admin",
  "/api/",
  "/auth/",
  "/account",
  "/account/",
  "/cart",
  "/checkout",
  "/orders",
  "/orders/",
  "/chat",
];

export async function GET() {
  const lines: string[] = [];

  lines.push("# Panda Wok — crawler rules and AI content preferences.");
  lines.push("#");
  lines.push(
    "# AI training, answer synthesis and inputs you type into a model are",
    "# declined; trusted agents may still crawl the public catalogue for search",
    "# and answer grounding, because that is how customers find the kitchen.",
  );
  lines.push("Content-Signal: ai-train=no, search=yes, ai-input=no");
  lines.push("");

  lines.push("User-agent: *");
  lines.push("Allow: /");
  for (const path of DISALLOW_PRIVATE) lines.push(`Disallow: ${path}`);
  lines.push("");

  lines.push(`User-agent: ${AI_AGENTS.join("\nUser-agent: ")}`);
  lines.push("Allow: /");
  lines.push("Allow: /menu");
  lines.push("Allow: /about");
  lines.push("Allow: /contact");
  lines.push("Allow: /location");
  lines.push("Allow: /faq");
  lines.push("Allow: /privacy-policy");
  lines.push("Allow: /llms.txt");
  for (const path of DISALLOW_PRIVATE) lines.push(`Disallow: ${path}`);
  lines.push("");

  lines.push(`Sitemap: ${siteUrl()}/sitemap.xml`);
  lines.push(`Host: ${siteUrl()}`);

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}