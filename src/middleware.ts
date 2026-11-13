import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  localeFromPathname,
  stripLocale,
  isLocale,
} from "@/lib/i18n/config";

/**
 * Paths that are not part of the localised customer site and must never be
 * rewritten to `/{locale}/…`: the ops console, the auth screens, the API, the
 * agent text contract and Next's generated metadata routes. Everything else
 * without a locale segment is served from the `[lang]` tree.
 */
const LOCALE_EXEMPT = [
  "/admin",
  "/auth",
  "/api",
  "/llms-txt",
  "/opengraph-image",
  "/twitter-image",
  "/icon",
  "/apple-icon",
  "/manifest.webmanifest",
] as const;

function needsLocale(pathname: string): boolean {
  if (localeFromPathname(pathname)) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return !LOCALE_EXEMPT.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The locale a visitor should get on a bare path: their explicit choice first,
 * then the browser's Accept-Language, then English. The cookie is written by the
 * switcher; reading it here (rather than in the page) is what lets the pages
 * themselves be prerendered per locale.
 */
function requestLocale(request: NextRequest): string {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return localeFromAcceptLanguage(request.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}

/**
 * Protected prefixes are guarded here as a fast gate. Route handlers and
 * server actions re-check with requireUser/requireCapability, because
 * middleware alone is not an authorization boundary.
 */
const PROTECTED_PREFIXES = [
  "/account",
  "/checkout",
  "/orders",
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

  // The customer site lives under `/[lang]`, so every check below works on the
  // bare path — the one without the locale prefix — while the browser keeps the
  // path it asked for.
  const localeInPath = localeFromPathname(pathname);
  const barePath = localeInPath ? stripLocale(pathname) : pathname;

  // Markdown for Agents (RFC: Accept: text/markdown). Honest AI agents request
  // a markdown view; browsers never send this exact media type alone. Rewrite
  // to the llms.txt contract so agents get one canonical, data-grounded text
  // representation of the public site.
  if (
    MARKDOWN_PAGES.has(barePath) &&
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
    (prefix) => barePath === prefix || barePath.startsWith(`${prefix}/`),
  );

  if (needsAuth && !userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // A bare public path is redirected to its locale-prefixed twin (`/menu` →
  // `/en/menu`), so every customer page lives at one canonical, prerenderable
  // URL. The redirect — not a rewrite — is what makes the locale visible and
  // indexable; existing bare links keep working because they land here first.
  if (!localeInPath && needsLocale(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${requestLocale(request)}${pathname === "/" ? "" : pathname}`;
    const redirect = NextResponse.redirect(url, 307);
    // Carry across any session cookie refreshed above, or the visitor would be
    // silently signed out on the very navigation that refreshed the token.
    for (const cookie of sessionResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    applySecurityHeaders(redirect);
    return redirect;
  }

  // Admin routes are dynamic and personal: keep them out of every cache and
  // out of search indexes even if a page-level directive is ever missed.
  //
  // `/admin` is deliberately NOT in PROTECTED_PREFIXES: it is opened with the
  // ops passcode / staff login id (checked in AdminLayout), not a customer
  // session, so nobody is blocked at the door. The `x-pw-path` request header
  // lets createServerSupabase() elevate that request to the service role, which
  // the gate — not `auth.uid()` — has already authorised.
  if (barePath.startsWith("/admin")) {
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
  // and the AI providers. connect.facebook.net is the Meta Pixel script origin
  // (only emitted when the owner has a pixel configured). Keep this list in sync
  // with the app's outbound hosts.
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob: *.supabase.co https:",
      "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
      "font-src 'self' fonts.gstatic.com data:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net",
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
