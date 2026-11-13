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

const isSupabaseAuthCookie = (name) =>
  name.startsWith("sb-") && name.includes("-auth-token");

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
