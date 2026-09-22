import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Protected prefixes are guarded here as a fast gate. Route handlers and
 * server actions re-check with requireUser/requireCapability, because
 * middleware alone is not an authorization boundary.
 */
const PROTECTED_PREFIXES = [
  "/account",
  "/checkout",
  "/orders",
  "/loyalty",
  "/feedback/new",
  "/chat",
] as const;

export async function middleware(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const needsAuth = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (needsAuth && !userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Admin routes are dynamic and personal: keep them out of every cache and
  // out of search indexes even if a page-level directive is ever missed.
  if (pathname.startsWith("/admin")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "no-store, max-age=0");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimisation, so the
     * session cookie stays fresh and admin headers are always applied.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|gif|woff2?)$).*)",
  ],
};
