import { NextResponse, type NextRequest } from "next/server";
import {
  getFeaturedItems,
  getFeatureFlagMap,
  getMenuRatings,
  getPublicCategories,
  getPublicMenu,
  getPublicSettings,
  getRestaurant,
} from "@/lib/services/catalog";
import { getAnnouncements } from "@/lib/services/content";
import { toLocale } from "@/lib/i18n/config";

/**
 * The storefront's one bootstrap read.
 *
 * Every customer page used to be a server component, so the Worker rendered
 * React, awaited the catalogue, and paid the CPU cost of both on each document
 * request — which is what pushed the Free plan past its 10 ms budget. The pages
 * are static shells now and read their data here instead, so a page view is one
 * cached JSON request the edge can answer without invoking the renderer.
 *
 * One route rather than one per page: the shell (header/footer/brand/flags) and
 * the page bodies need almost the same catalogue, and a single response means a
 * navigation costs one request, not three. The payload is public and
 * locale-scoped, so it carries a long edge TTL and no cookies.
 */
export async function GET(request: NextRequest) {
  const locale = toLocale(request.nextUrl.searchParams.get("locale") ?? undefined);

  try {
    const [settings, flags, restaurant, categories, menu, ratings, featured, announcements] =
      await Promise.all([
        getPublicSettings(),
        getFeatureFlagMap(),
        getRestaurant(),
        getPublicCategories(),
        getPublicMenu(),
        getMenuRatings(),
        getFeaturedItems(6),
        getAnnouncements(locale),
      ]);

    return NextResponse.json(
      {
        ok: true,
        data: {
          locale,
          settings,
          flags,
          restaurant,
          categories,
          menu,
          ratings: Object.fromEntries(ratings),
          featured,
          announcements,
        },
      },
      {
        headers: {
          // Public and locale-scoped, so it is safe to share and cache. Short
          // max-age keeps an admin edit visible quickly; the edge adds SWR.
          "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("public bootstrap read failed", error);
    return NextResponse.json(
      { ok: false, error: "read_failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
