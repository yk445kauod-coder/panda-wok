import { NextResponse, type NextRequest } from "next/server";
import { getPageContent, getAnnouncements } from "@/lib/services/content";
import { toLocale } from "@/lib/i18n/config";

/**
 * Admin-editable page copy, for the static content shells (about, privacy).
 *
 * These pages are now static documents; their copy comes from `page_content`,
 * which the owner edits in the console, so the browser reads it here. Rows are
 * per-locale with an English fallback inside the reader, so a missing
 * translation degrades to English rather than blanking the page.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const locale = toLocale(params.get("locale") ?? undefined);
  const page = params.get("page") ?? "";

  try {
    const [sections, announcements] = await Promise.all([
      page ? getPageContent(page, locale) : Promise.resolve([]),
      getAnnouncements(locale),
    ]);
    return NextResponse.json(
      { ok: true, data: { locale, page, sections, announcements } },
      {
        headers: {
          "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("public content read failed", error);
    return NextResponse.json(
      { ok: false, error: "read_failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
