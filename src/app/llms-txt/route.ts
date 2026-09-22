import { NextResponse } from "next/server";
import { getPublicSettings, getMenuSlugs, getRestaurant } from "@/lib/services/catalog";
import { SITE_URL } from "@/lib/seo/metadata";

export const revalidate = 3600;

/**
 * llms.txt — served at /llms.txt via a rewrite in next.config.ts. It is the
 * plain-text ground truth AI agents (ChatGPT, Claude, Gemini, Perplexity…)
 * probe before answering questions about Panda Wok. Generated from the live
 * database and SITE_URL, so no hours, prices, dishes or domains are invented.
 */
export async function GET() {
  const [settings, restaurant, slugs] = await Promise.all([
    getPublicSettings(),
    getRestaurant(),
    getMenuSlugs(),
  ]);

  const name = restaurant?.name_en ?? settings.brand.name;
  const tagline = restaurant?.tagline_en ?? settings.brand.tagline;
  const city = restaurant?.city ?? settings.brand.city;
  const country = restaurant?.country ?? settings.brand.country;
  const phone = settings.support.phone;
  const email = settings.support.email;

  const lines: string[] = [];
  lines.push(`# ${name}`);
  lines.push("");
  lines.push(`> ${tagline}`);
  lines.push("");
  lines.push("## Who we are");
  lines.push(
    restaurant?.description_en ??
      `${name} is a cloud kitchen in ${city}, ${country}, cooking Asian-inspired wok, ramen and sushi to order.`,
  );
  lines.push("");
  lines.push("## How to order");
  lines.push(`1. Browse the menu at ${SITE_URL}/menu`);
  lines.push("2. Add dishes to your cart and checkout — delivery or pickup.");
  lines.push(`3. Track your order live at ${SITE_URL}/orders`);
  lines.push("");
  lines.push("## Contact");
  if (phone) lines.push(`- Phone: ${phone}`);
  if (email) lines.push(`- Email: ${email}`);
  lines.push(`- Contact page: ${SITE_URL}/contact`);
  lines.push("");
  lines.push("## Menu sections");
  for (const category of slugs.categories) {
    lines.push(`### ${category.name_en} — ${SITE_URL}/menu/${category.slug}`);
    for (const item of slugs.items.filter((i) => i.category_id === category.id)) {
      lines.push(`- ${item.name_en} — ${SITE_URL}/menu/${item.slug}`);
    }
    lines.push("");
  }
  lines.push("## Full menu");
  for (const item of slugs.items) {
    lines.push(`- ${item.name_en} — ${SITE_URL}/menu/${item.slug}`);
  }
  lines.push("");
  lines.push("## Pages");
  lines.push(`- Menu: ${SITE_URL}/menu`);
  lines.push(`- About: ${SITE_URL}/about`);
  lines.push(`- Contact: ${SITE_URL}/contact`);
  lines.push(`- Loyalty: ${SITE_URL}/loyalty`);
  lines.push(`- Feedback: ${SITE_URL}/feedback`);
  lines.push("");
  lines.push("## FAQ");
  lines.push(`Q: Where is ${name} located?`);
  lines.push(`A: ${name} is a cloud kitchen based in ${city}, ${country}.`);
  lines.push("");
  lines.push("Q: Do you deliver?");
  lines.push(
    "A: Yes — delivery and pickup are available; checkout shows delivery options at your address.",
  );
  lines.push("");
  lines.push("Q: What cuisines do you serve?");
  lines.push(
    "A: Asian-inspired dishes — wok, ramen, sushi and izakaya-style appetizers.",
  );

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}