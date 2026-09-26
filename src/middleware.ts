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

/**
 * Pages that have a faithful markdown counterpart in /llms.txt. Agents that
 * ask for `text/markdown` get the text contract instead of the HTML document,
 * mirroring Cloudflare's "Markdown for Agents" behaviour in app code.
 */
const MARKDOWN_PAGES = new Set(["/", "/menu", "/about", "/contact", "/faq", "/location", "/privacy-policy"]);

export async function middleware(request: NextRequest) {
  const { response: sessionResponse, userId } = await updateSession(request);
  let response = sessionResponse;
  const { pathname, search } = request.nextUrl;

  // Markdown for Agents (RFC: Accept: text/markdown). Honest AI agents request
  // a markdown view; browsers never send this exact media type alone. Rewrite
  // to the llms.txt contract so agents get one canonical, data-grounded text
  // representation of the public site.
  if (
    MARKDOWN_PAGES.has(pathname) &&
    request.headers.get("accept")?.includes("text/markdown")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/llms-txt";
    url.search = "";
    const rewritten = NextResponse.rewrite(url);
    applySecurityHeaders(rewritten);
    rewritten.headers.set("Content-Type", "text/markdown; charset=utf-8");
    return rewritten;
  }

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
  //
  // `/admin` is deliberately NOT in PROTECTED_PREFIXES: it is opened with the
  // ops passcode / staff login id (checked in AdminLayout), not a customer
  // session, so nobody is blocked at the door. The `x-pw-path` request header
  // lets createServerSupabase() elevate that request to the service role, which
  // the gate — not `auth.uid()` — has already authorised.
  if (pathname.startsWith("/admin")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pw-path", pathname);
    response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "no-store, max-age=0");
  } else if (request.headers.has("x-pw-path")) {
    // Stripped on every non-admin path: the header is what lets
    // createServerSupabase() elevate a request to the service role, so a client
    // must never be able to inject it for a page the gate does not cover.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("x-pw-path");
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  applySecurityHeaders(response);
  return response;
}

/**
 * Security headers for dynamic responses. `public/_headers` only covers static
 * assets on Workers, so document responses are hardened here — otherwise the
 * CSP and frame protections would silently apply to nothing but CSS and images.
 */
function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=(self)",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // wss: is required for Supabase Realtime; img/connect allow Supabase Storage
  // and the AI providers. Keep this list in sync with the app's outbound hosts.
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob: *.supabase.co https:",
      "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
      "font-src 'self' fonts.gstatic.com data:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https: wss:",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  response.headers.set("Content-Language", "en, ar");

  // Agent discovery (RFC 8288). Every dynamic document advertises the two
  // machine-readable views of the site so AI agents that follow Link headers
  // can find the text contract and the sitemap without extra crawling.
  response.headers.set(
    "Link",
    `</llms.txt>; rel="alternate"; type="text/markdown", </sitemap.xml>; rel="sitemap"`,
  );
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
