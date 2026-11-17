/**
 * Edge-cache policy for the Pages front door.
 *
 * The customer site is prerendered per locale (`/en/...`, `/ar/...`), so a
 * cached hit is answered by the CDN without running the Worker at all. That is
 * what keeps a rush — or several admins and a crawler at once — off the Free
 * plan's per-request CPU/subrequest budget.
 *
 * The policy is deliberately narrow. Only anonymous, un-personalised document
 * navigations to a small allowlist of public pages are cached. Anything carrying
 * a session, the admin cookie, an RSC/prefetch marker, an Authorization header,
 * or a markdown-for-agents Accept is passed straight through, so no private or
 * per-navigation payload can ever be stored.
 *
 * Cached and served pages are byte-identical — this only decides *who serves*
 * them and for how long. A catalogue edit is visible once the TTL lapses, and an
 * admin mutation purges the whole set immediately.
 *
 * Kept free of any Cloudflare globals so the decision is unit-tested directly
 * (`tests/edge-cache.test.ts`).
 */

/** The two site locales, mirroring `LOCALES` in `src/lib/i18n/config.ts`. */
export const CACHE_LOCALES = ["en", "ar"];

/**
 * Public, non-personalised pages, written without a locale prefix. `/menu/*` is
 * a dish or category detail. Everything else (account, checkout, orders,
 * loyalty, feedback, chat, auth, admin, api) is either session-scoped or a
 * redirect and must never be stored.
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

const LOCALE_PREFIX = /^\/(en|ar)(?=\/|$)/;

/** Removes a leading locale segment: `/ar/menu` → `/menu`, `/en` → `/`. */
function stripLocale(pathname) {
  const match = pathname.match(LOCALE_PREFIX);
  if (!match) return pathname;
  return pathname.slice(match[0].length) || "/";
}

/** The locale-prefixed form of a bare public path: `/menu` → `/ar/menu`. */
function withLocale(locale, barePath) {
  return `/${locale}${barePath === "/" ? "" : barePath}`;
}

/**
 * Seconds a cached page is fresh. A *cold* render is what 1102s on the Free
 * plan, so a short TTL keeps evicting the only copies that can be served
 * without re-running Next. Ten minutes is short enough that a change made
 * directly in the database shows up promptly, and admin edits do not wait at all
 * — a non-GET under `/admin` purges every key (`shouldPurgeAfter`).
 */
export const EDGE_TTL_SECONDS = 600;

/**
 * Seconds a stale copy may be served while revalidating in the background. This
 * is the property that makes the cache durable: after the fresh window the CDN
 * keeps answering from cache and refreshes in the background, so the origin sees
 * one render per key per TTL instead of one per visitor. Long enough that the
 * cache never goes cold between visits.
 */
export const EDGE_SWR_SECONDS = 86400;

/** How long a stale copy may still be served if the origin errors (1102/5xx),
 * so a cold-start failure is masked by the last good page instead of shown. */
export const EDGE_STALE_IF_ERROR_SECONDS = 604800;

/** The Cache-Control a cached public page is stored with. */
export const EDGE_CACHE_CONTROL = `public, max-age=0, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=${EDGE_SWR_SECONDS}, stale-if-error=${EDGE_STALE_IF_ERROR_SECONDS}`;

/**
 * True when a cookie name carries a visitor's signed-in session.
 *
 * Two shapes must both be recognised: the D1 stateless session
 * (`pw-auth-token`, what the app issues today) and the legacy Supabase token
 * (`sb-…-auth-token`, chunked as `.0`, `.1`, …). Recognising only the Supabase
 * name — as this did — treats a signed-in visitor as anonymous, so their page
 * could be stored under a public key and served to someone else. This is the
 * single most dangerous predicate in the file, so it is deliberately broad.
 */
const isSessionCookie = (name) =>
  name === "pw-auth-token" ||
  name.startsWith("pw-auth-token.") ||
  (name.startsWith("sb-") && name.includes("-auth-token"));

/** The admin gate cookie, which must never be stored or served from the cache. */
const isAdminCookie = (name) => name === "panda-wok.admin";

/**
 * True when a locale-prefixed path is one of the public, cacheable pages. A bare
 * path (`/menu`) is only ever a 307 redirect to its locale twin, so it is never a
 * page to store.
 */
export function isCacheablePath(pathname) {
  if (!LOCALE_PREFIX.test(pathname)) return false;
  const bare = stripLocale(pathname);
  return PUBLIC_PATHS.some(
    (base) => bare === base || bare.startsWith(`${base}/`),
  );
}

/**
 * Public JSON reads the storefront shells fetch after paint.
 *
 * Every customer page is a static shell whose data arrives from `/api/public/*`,
 * so a page view is *two* Worker invocations: the document (edge-cached) and the
 * JSON. The catalogue response is ~120 KB and runs eight D1 reads, so leaving it
 * uncached puts the cost that was removed from the renderer straight back onto
 * the origin — the same 10 ms CPU ceiling, Error 1102. These are public,
 * cookie-independent and locale-scoped, so they are safe to cache at the edge
 * exactly like the pages.
 *
 * Deliberately **not** here: `/api/public/me/*` (per-customer, must never be
 * shared) or `/api/analytics` (a write).
 */
export const CACHEABLE_API_PATHS = [
  "/api/public/bootstrap",
  "/api/public/content",
  "/api/public/menu/",
];

/**
 * True when this request may be cached as a public JSON read. The key includes
 * the query string (the locale lives there for bootstrap/content), so the two
 * locales can never collide under one key. A prefix match must land on a path
 * boundary, so `/api/public/bootstrapX` is not treated as bootstrap.
 */
export function isCacheableApiPath(pathname) {
  return CACHEABLE_API_PATHS.some((base) => {
    if (pathname === base) return true;
    // `/api/public/menu/` ends in a slash and owns its whole subtree.
    if (base.endsWith("/")) return pathname.startsWith(base);
    return pathname.startsWith(`${base}/`);
  });
}

/**
 * True when this request may be served from (and stored in) the edge cache.
 * `request` is a plain snapshot: `{ method, pathname, cookieNames, accept,
 * hasRscHeader, hasPrefetchHeader, hasAuthorization }`.
 */
export function isCacheableRequest(request) {
  const {
    method,
    pathname,
    cookieNames = [],
    accept,
    hasRscHeader,
    hasPrefetchHeader,
    hasAuthorization,
  } = request;

  if (method !== "GET") return false;
  if (hasRscHeader || hasPrefetchHeader || hasAuthorization) return false;
  if (cookieNames.some(isSessionCookie)) return false;
  if (cookieNames.some(isAdminCookie)) return false;
  if (!isCacheablePath(pathname)) return false;
  // The markdown-for-agents rewrite has its own Content-Type; caching it under
  // the same key as the HTML would serve the wrong representation. `accept` is
  // the request's Accept header (media types), not Accept-Language.
  if (String(accept ?? "").toLowerCase().includes("text/markdown")) return false;

  return true;
}

/**
 * True when a public JSON read may be served from (and stored in) the edge
 * cache. Same public rules as `isCacheableRequest`, but the path is the API
 * allowlist rather than the page list. `request` is the same snapshot, plus
 * `search` for the locale-scoped query string.
 */
export function isCacheableApiRequest(request) {
  const {
    method,
    pathname,
    cookieNames = [],
    accept,
    hasRscHeader,
    hasPrefetchHeader,
    hasAuthorization,
  } = request;

  if (method !== "GET") return false;
  if (hasRscHeader || hasPrefetchHeader || hasAuthorization) return false;
  if (cookieNames.some(isSessionCookie)) return false;
  if (cookieNames.some(isAdminCookie)) return false;
  if (!isCacheableApiPath(pathname)) return false;
  if (String(accept ?? "").toLowerCase().includes("text/markdown")) return false;

  return true;
}

/**
 * The cache key for a public JSON read. The query string is part of it because
 * the locale lives there (`?locale=ar`), so the two locales get separate entries
 * and can never be served to each other.
 */
export function toApiCacheUrl(pathname, search = "") {
  return `${CACHE_ORIGIN}${pathname}${search || ""}`;
}

/**
 * The console's document shell is cacheable at the edge — unlike its data.
 *
 * Every `/admin/*` page is now a static SPA shell: the layout reads no cookies,
 * no headers and no database, so the Worker serves byte-identical HTML for every
 * console route and every role. Verified live: the body is identical with no
 * cookie and with a bogus gate cookie, and the response carries no `Set-Cookie`.
 * The gate, the role and every row arrive from `/api/admin/*` in the browser,
 * and those API responses are never stored here.
 *
 * So caching the shell removes one Worker invocation per console navigation and
 * refresh — the cost that multiplies when several staff keep the console open —
 * without ever storing anything private. It is deliberately a *separate*
 * predicate from `isCacheableRequest`, whose admin exclusion guards the data
 * surface and stays as it is.
 *
 * The key carries the build id (see `adminShellCacheUrl`). A rebuild changes the
 * shell's asset hashes, so keying by build means a deploy is a cold cache rather
 * than a stale shell pointing at chunks that may no longer be reachable.
 */
export const ADMIN_SHELL_TTL_SECONDS = 300;
export const ADMIN_SHELL_CACHE_CONTROL = `public, max-age=0, s-maxage=${ADMIN_SHELL_TTL_SECONDS}`;

/** A console document path (`/admin`, `/admin/orders`), never the `/api/admin` data. */
export function isAdminShellPath(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * True when this request is a console *document* fetch whose response is the
 * shared, data-free shell. A per-navigation variant (RSC, prefetch, an explicit
 * Authorization) is passed through so it is never stored under the shell's key.
 */
export function isAdminShellRequest(request) {
  const { method, pathname, hasRscHeader, hasPrefetchHeader, hasAuthorization } =
    request;
  if (method !== "GET") return false;
  if (hasRscHeader || hasPrefetchHeader || hasAuthorization) return false;
  return isAdminShellPath(pathname);
}

/**
 * The shell's cache key. The build id is part of it so a deploy never serves the
 * previous build's document — which would reference chunk hashes that may be
 * gone — and a route keeps its own key (`/admin` and `/admin/orders` differ).
 */
export function adminShellCacheUrl(pathname, buildId) {
  return `${CACHE_ORIGIN}/__shell/${buildId}${pathname}`;
}

/**
 * The cache key. The locale lives in the path now (`/ar/menu`), so the pathname
 * alone distinguishes the variants — no extra query needed. The origin is a
 * fixed constant rather than the request host so a page has one key regardless
 * of which host served it, which lets an admin purge it deterministically.
 */
export const CACHE_ORIGIN = "https://edge.cache.internal";

export function toCacheUrl(pathname) {
  return `${CACHE_ORIGIN}${pathname}`;
}

/** Every stored key for one bare public path, across locales. */
export function cacheKeysFor(barePath) {
  return CACHE_LOCALES.map((locale) => toCacheUrl(withLocale(locale, barePath)));
}

/**
 * Every stored key for the cacheable public JSON reads, both locales.
 *
 * Only the two fixed paths can be enumerated, exactly like `PUBLIC_PATHS` for
 * pages: `/api/public/menu/<slug>` has unbounded keys, so a dish edit clears it
 * by TTL (`EDGE_TTL_SECONDS`) rather than by purge. That matches the dish HTML
 * page, which has the same shape, and it is safe because `place_order` validates
 * modifiers server-side — a stale dish page can at worst reject an add, never
 * record a bad order.
 */
export function apiCacheKeys() {
  const keys = [];
  for (const locale of CACHE_LOCALES) {
    keys.push(toApiCacheUrl("/api/public/bootstrap", `?locale=${locale}`));
    keys.push(toApiCacheUrl("/api/public/content", `?locale=${locale}`));
  }
  return keys;
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
 * Drops every cached public page and the public JSON reads. `getPlainText`,
 * settings and branding can change any of them; deleting the whole set is
 * bounded and rare, and it means an edit is visible on the next request instead
 * of at the TTL. Best-effort: a failed delete only means a page refreshes at the
 * TTL.
 */
export async function purgePublicCache(cache) {
  const keys = [...PUBLIC_PATHS.flatMap(cacheKeysFor), ...apiCacheKeys()];
  await Promise.all(
    keys.map((key) => cache.delete(new Request(key)).catch(() => false)),
  );
}
