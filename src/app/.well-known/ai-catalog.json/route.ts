import { NextResponse } from "next/server";
import { getPublicSettings, getRestaurant, getMenuSlugs } from "@/lib/services/catalog";
import { siteUrl } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

/**
 * ARD (Agentic Resource Discovery) manifest — RFC 9727 / agenticresourcediscovery.org.
 *
 * Advertises the site's machine-readable surfaces and catalogue to AI-agent
 * registries and browsers. Everything points at real, serving resources
 * (llms.txt, sitemap, menu pages) generated from the live database, so a
 * registry can learn how to answer questions about the kitchen.
 */
export async function GET() {
  const [settings, restaurant, slugs] = await Promise.all([
    getPublicSettings(),
    getRestaurant(),
    getMenuSlugs(),
  ]);

  const origin = siteUrl();
  const name = restaurant?.name_en ?? settings.brand.name;

  const entries: Record<string, unknown>[] = [
    {
      urn: `urn:air:${new URL(origin).hostname}:text:llms`,
      displayName: "Panda Wok text contract",
      subtitle: "Markdown overview of the site for AI agents",
      type: "text/markdown",
      description: "Generated weekly from the live catalogue: who we are, how to order, contact, and every dish with its URL.",
      url: `${origin}/llms.txt`,
      representativeQueries: [
        "What does Panda Wok serve?",
        "How do I order from Panda Wok?",
        "What is on the Panda Wok menu?",
      ],
    },
    {
      urn: `urn:air:${new URL(origin).hostname}:webpage:home`,
      displayName: "Panda Wok homepage",
      subtitle: "Landing page with opening hours and order CTA",
      type: "text/html",
      url: `${origin}/`,
      representativeQueries: [
        "Where do I order from Panda Wok?",
        "Is Panda Wok accepting orders now?",
      ],
    },
    {
      urn: `urn:air:${new URL(origin).hostname}:sitemap:sitemap`,
      displayName: "Panda Wok sitemap",
      subtitle: "Full public URL list",
      type: "application/xml",
      url: `${origin}/sitemap.xml`,
      representativeQueries: [],
    },
  ];

  // One entry per live menu category, linking to its full page.
  for (const category of slugs.categories) {
    entries.push({
      urn: `urn:air:${new URL(origin).hostname}:menu:${category.slug}`,
      displayName: category.name_en,
      subtitle: `${name} menu section`,
      type: "text/html",
      url: `${origin}/menu/${category.slug}`,
      representativeQueries: [
        `Show me ${category.name_en?.toLowerCase() ?? ""} on the Panda Wok menu`,
        `Does Panda Wok have ${category.name_en?.toLowerCase() ?? ""}?`,
      ],
    });
  }

  const manifest = {
    specVersion: "0.1",
    host: {
      name,
      url: origin,
      description: restaurant?.description_en ?? settings.brand.tagline,
    },
    entries,
  };

  return NextResponse.json(manifest, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}