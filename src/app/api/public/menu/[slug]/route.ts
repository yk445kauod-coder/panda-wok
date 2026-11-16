import { NextResponse, type NextRequest } from "next/server";
import {
  getCategoryBySlug,
  getMenuItemBySlug,
  getMenuItemsByCategory,
  getPublicMenu,
} from "@/lib/services/catalog";

/**
 * One menu slug, resolved to either a section or a dish.
 *
 * `/menu/<slug>` serves both shapes (a category page and a dish page), so the
 * static shell cannot know which it is — and the dish view needs the modifier
 * groups, which the catalogue bootstrap does not carry. The browser asks here,
 * and the resolver mirrors the server page's order exactly: category first,
 * then dish, then `null` (the client renders not-found for that).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const category = await getCategoryBySlug(slug);
    if (category) {
      const items = await getMenuItemsByCategory(category.id);
      return NextResponse.json(
        { ok: true, data: { kind: "category", category, items } },
        { headers: cacheHeaders() },
      );
    }

    const dish = await getMenuItemBySlug(slug);
    if (dish) {
      const menu = await getPublicMenu();
      const related = menu.items
        .filter((i) => i.category_id === dish.category_id && i.id !== dish.id)
        .slice(0, 4);
      return NextResponse.json(
        { ok: true, data: { kind: "dish", dish, related } },
        { headers: cacheHeaders() },
      );
    }

    return NextResponse.json(
      { ok: true, data: { kind: "missing" } },
      { headers: cacheHeaders() },
    );
  } catch (error) {
    console.error("public menu slug read failed", error);
    return NextResponse.json(
      { ok: false, error: "read_failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

function cacheHeaders() {
  return {
    "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  };
}
