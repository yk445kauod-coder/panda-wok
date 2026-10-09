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

/**
 * Seconds a cached page is fresh. The origin renders this app on a 10 ms CPU
 * budget (Workers Free), so a *cold* render is what 1102s: a short TTL keeps
 * evicting the only copies that can be served without re-running Next. Ten
 * minutes is short enough that a change made directly in the database shows up
 * promptly, and admin edits do not wait at all — a non-GET under `/admin` purges
 * every key (`shouldPurgeAfter`).
 */
export const EDGE_TTL_SECONDS = 600;

/**
 * Seconds a stale copy may be served while revalidating in the background.
 * This is the property that makes the cache durable: after the fresh window the
 * CDN keeps answering from cache and refreshes in the background, so the origin
 * sees one render per key per TTL instead of one per visitor. Long enough that
 * the cache never goes cold between visits.
 */
export const EDGE_SWR_SECONDS = 86400;

/** How long a stale copy may still be served if the origin errors (1102/5xx),
 * so a cold-start failure is masked by the last good page instead of shown. */
export const EDGE_STALE_IF_ERROR_SECONDS = 604800;

/** The Cache-Control a cached public page is stored with. */
export const EDGE_CACHE_CONTROL = `public, max-age=0, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=${EDGE_SWR_SECONDS}, stale-if-error=${EDGE_STALE_IF_ERROR_SECONDS}`;

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
 * The cache key.
 *
 * `caches.default` keys on the URL alone, so the language variant is appended.
 * The origin is a fixed constant rather than the request host so that a page has
 * one key regardless of which host served it — that lets the admin actions purge
 * it deterministically (`src/lib/cache/edge.ts`, which mirrors this exactly; the
 * two are asserted equal in `tests/edge-cache.test.ts`). The page body does not
 * depend on the host — canonical URLs come from `NEXT_PUBLIC_SITE_URL`.
 */
export const CACHE_ORIGIN = "https://edge.cache.internal";

export function toCacheUrl(pathname, variant) {
  return `${CACHE_ORIGIN}${pathname}?__pw_lang=${variant}`;
}

export const CACHE_LOCALES = ["en", "ar"];

/** Every stored key for one public path, across locales. */
export function cacheKeysFor(pathname) {
  return CACHE_LOCALES.map((locale) => toCacheUrl(pathname, locale));
}

/**
 * True when the request is an admin mutation, after which the cached public
 * pages may be out of date. Server actions POST back to the page that hosts them,
 * so an edit lands as a non-GET request under `/admin`. Customer traffic never
 * matches, so a rush is not affected.
 */
export function shouldPurgeAfter(snapshot) {
  return snapshot.method !== "GET" && snapshot.pathname.startsWith("/admin");
}

/**
 * Drops every cached public page. `getPlainText`, settings and branding can
 * change any of them; deleting the whole set is bounded and rare, and it means an
 * edit is visible on the next request instead of at the TTL. Best-effort: a
 * failed delete only means the page refreshes at the TTL.
 */
export async function purgePublicCache(cache) {
  const keys = PUBLIC_PATHS.flatMap(cacheKeysFor);
  await Promise.all(
    keys.map((key) => cache.delete(new Request(key)).catch(() => false)),
  );
}
