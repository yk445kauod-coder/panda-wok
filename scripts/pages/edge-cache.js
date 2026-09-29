/**
 * Edge-cache policy for the Pages front door.
 *
 * Cloudflare's CDN never caches this app: Next renders every customer page
 * dynamically and sends `no-store`, so during a rush all traffic reaches the
 * Worker, and the Free plan's per-request CPU/subrequest budget — not the CDN —
 * becomes the ceiling. Caching the public HTML at the edge is what lets a rush
 * be absorbed by the CDN instead of the origin: repeat visitors and crawlers are
 * answered without a Worker invocation at all.
 *
 * The policy is deliberately narrow. Only anonymous, un-personalised document
 * navigations to a small allowlist of public pages are cached. Anything carrying
 * a session, the admin cookie, an RSC/prefetch marker, an Authorization header,
 * or a markdown-for-agents Accept is passed straight through, so no private or
 * per-navigation payload can ever be stored.
 *
 * Cached and served pages are byte-identical — this only decides *who serves*
 * them and for how long. A catalogue edit is visible once the TTL lapses.
 *
 * Kept free of any Cloudflare globals so the decision is unit-tested directly
 * (`tests/edge-cache.test.ts`).
 */

/**
 * Public, non-personalised pages. `/menu/*` is a dish detail. Everything else
 * (account, checkout, orders, loyalty, feedback, chat, auth, admin, api) is
 * either session-scoped or a redirect and must never be stored.
 */
export const PUBLIC_PATHS = [
  "/",
  "/menu",
  "/about",
  "/contact",
  "/faq",
  "/location",
  "/privacy-policy",
  "/cart",
];

/** Seconds a cached page is fresh. Short on purpose: a rush win without a long
 * stale window. Raise it if the origin is ever under sustained load. */
export const EDGE_TTL_SECONDS = 60;

/** Seconds a stale copy may be served while revalidating in the background, so
 * a burst never waits on (or stampedes) the origin. */
export const EDGE_SWR_SECONDS = 300;

/** The Cache-Control a cached public page is stored with. */
export const EDGE_CACHE_CONTROL = `public, max-age=0, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=${EDGE_SWR_SECONDS}, stale-if-error=600`;

const isSupabaseAuthCookie = (name) =>
  name.startsWith("sb-") && name.includes("-auth-token");

export function isCacheablePath(pathname) {
  return PUBLIC_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/**
 * The language a response is rendered in, for the cache key. `getLocale()`
 * resolves an explicit cookie first, then Accept-Language, then English — so the
 * key must carry the same distinction or an Arabic reader could be served a
 * cached English page.
 */
export function localeVariant({ cookieLocale, acceptLanguage } = {}) {
  const cookie = String(cookieLocale ?? "").trim().toLowerCase();
  if (cookie === "ar") return "ar";
  if (cookie === "en") return "en";
  const accept = String(acceptLanguage ?? "").toLowerCase();
  return accept.startsWith("ar") || accept.includes(",ar") ? "ar" : "en";
}

/**
 * True when this request may be served from (and stored in) the edge cache.
 * `request` is a plain snapshot: `{ method, pathname, cookieNames, cookieLocale,
 * acceptLanguage, accept, hasRscHeader, hasPrefetchHeader, hasAuthorization }`.
 */
export function isCacheableRequest(request) {
  const {
    method,
    pathname,
    cookieNames = [],
    acceptLanguage,
    accept,
    hasRscHeader,
    hasPrefetchHeader,
    hasAuthorization,
  } = request;

  if (method !== "GET") return false;
  if (hasRscHeader || hasPrefetchHeader || hasAuthorization) return false;
  if (cookieNames.some(isSupabaseAuthCookie)) return false;
  if (cookieNames.includes("panda-wok.admin")) return false;
  if (!isCacheablePath(pathname)) return false;
  // The markdown-for-agents rewrite has its own Content-Type; caching it under
  // the same key as the HTML would serve the wrong representation. `accept` is
  // the request's Accept header (media types), not Accept-Language.
  if (String(accept ?? "").toLowerCase().includes("text/markdown")) return false;

  return true;
}

/**
 * The cache key. `caches.default` keys on the URL alone, so the language
 * variant is appended here rather than left implicit in a header.
 */
export function toCacheUrl(originalUrl, variant) {
  const url = new URL(originalUrl);
  url.searchParams.set("__pw_lang", variant);
  return url.toString();
}
