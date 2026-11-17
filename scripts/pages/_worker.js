import opennext from "./opennext-worker.js";
import {
  ADMIN_SHELL_CACHE_CONTROL,
  EDGE_CACHE_CONTROL,
  adminShellCacheUrl,
  isAdminShellRequest,
  isCacheableApiRequest,
  isCacheableRequest,
  purgePublicCache,
  shouldPurgeAfter,
  toApiCacheUrl,
  toCacheUrl,
} from "./edge-cache.js";

/**
 * Pages entrypoint. Pages advanced mode does not serve the assets directory
 * automatically, so anything that looks like a static file is offered to the
 * `ASSETS` binding first and only falls through to Next when it is absent.
 * Without this the site renders but every CSS/JS/asset request 404s.
 *
 * The server half of the OpenNext output lives in the *same* directory as the
 * client assets, and it contains the inlined server environment — including the
 * Supabase service role key. The extension test below matches `.js`/`.mjs`, so
 * without the deny list a request for `/cloudflare/next-env.mjs` is answered
 * straight out of `ASSETS` and the service role key is served to the public
 * (verified: HTTP 200). These prefixes are server-only and must never be
 * reachable over HTTP, regardless of what the request path looks like.
 */
const SERVER_ONLY_PREFIXES = [
  "/cloudflare/",
  "/server-functions/",
  "/middleware/",
  "/.build/",
  "/_open-next/",
];

const ASSET_PREFIXES = ["/_next/static/", "/mascots/"];
// `.html` is included so site-verification files (google*.html, bing*.html,
// etc.) served from `public/` are offered from ASSETS instead of falling through to
// Next's 404 page. Absent files still fall through — ASSETS.fetch returns 404 and
// the handler continues, so this never masks a real route.
const ASSET_FILE =
  /\.(?:svg|png|jpg|jpeg|webp|avif|ico|gif|css|js|mjs|woff2?|ttf|txt|xml|webmanifest|json|map|html)$/i;

/**
 * The Pages build id, inlined by `scripts/build-pages.mjs` at assembly time. It
 * is part of the console-shell cache key so a deploy invalidates the shell
 * instead of serving a document that references the previous build's chunks.
 */
const BUILD_ID = "__BUILD_ID__";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (SERVER_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return new Response("Not found", { status: 404 });
    }

    // A local file on disk (/_next/static/*, fonts, images, public/*) is served
    // straight from ASSETS, never cached by us.
    const looksLikeAsset =
      ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
      ASSET_FILE.test(pathname);
    if (looksLikeAsset && typeof env?.ASSETS !== "undefined") {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }

    const handler = opennext.fetch ?? opennext.default?.fetch;

    const snapshot = {
      method: request.method,
      pathname,
      search: new URL(request.url).search,
      cookieNames: parseCookieNames(request.headers.get("cookie")),
      accept: request.headers.get("accept"),
      hasRscHeader: request.headers.has("rsc"),
      hasPrefetchHeader:
        request.headers.has("next-router-prefetch") ||
        request.headers.has("next-router-state-tree"),
      hasAuthorization: request.headers.has("authorization"),
    };

    // Edge cache for anonymous public pages. During a rush this is the
    // difference between every hit running the Worker and the CDN answering
    // them: only a miss or a stale hit reaches Next, and a stale page is served
    // immediately while it revalidates in the background.
    const cacheUsable = typeof caches !== "undefined" && Boolean(caches.default);

    // The console's document shell is static and identical for every role, so a
    // console navigation can be answered from the CDN instead of running the
    // Worker to re-emit the same bytes. Only the *document* is stored — the
    // `/api/admin/*` reads are never cacheable — and a per-navigation variant
    // (RSC/prefetch) is passed through, so nothing private can land under the key.
    if (cacheUsable && isAdminShellRequest(snapshot)) {
      const cache = caches.default;
      // Keyed by build so a deploy is a cold cache, not a stale shell pointing
      // at chunk hashes the new build may no longer ship. `env.NEXT_BUILD_ID` is
      // the Pages build id; fall back to the constant in the bundle.
      const buildId = env?.NEXT_BUILD_ID ?? BUILD_ID;
      const cacheKey = new Request(adminShellCacheUrl(pathname, buildId), { method: "GET" });

      const hit = await cache.match(cacheKey);
      if (hit) return withCacheStatus(hit, "HIT");

      const response = await handler(request, env, ctx);
      if (response.status === 200 && isHtml(response)) {
        const cacheable = new Response(response.body, response);
        cacheable.headers.set("Cache-Control", ADMIN_SHELL_CACHE_CONTROL);
        ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
        return withCacheStatus(cacheable, "MISS");
      }
      return response;
    }

    // An admin edit can change any cached public page or public JSON read (menu,
    // settings, branding), and Next's `revalidatePath` only clears Next's own
    // cache. Purge ours on the way out so the next visitor gets the fresh data
    // instead of the old one. Public keys are enumerable (fixed paths, two
    // locales), so a blanket purge is bounded and cheap.
    const purgeAfter = cacheUsable && shouldPurgeAfter(snapshot);
    if (purgeAfter) ctx.waitUntil(purgePublicCache(caches.default));

    // Public JSON reads (`/api/public/bootstrap`, `…/content`, `…/menu/<slug>`)
    // back every static customer shell, so an uncached read puts the catalogue
    // cost straight back on the origin. Same public rules as the pages: no
    // session, no admin cookie, no RSC/prefetch, GET only. Keyed on the full URL
    // including the query string, so the locales never collide.
    if (cacheUsable && isCacheableApiRequest(snapshot)) {
      const cache = caches.default;
      const cacheKey = new Request(toApiCacheUrl(snapshot.pathname, snapshot.search), {
        method: "GET",
      });

      const hit = await cache.match(cacheKey);
      if (hit) return withCacheStatus(hit, "HIT");

      const response = await handler(request, env, ctx);
      if (response.status === 200 && isJson(response)) {
        const cacheable = new Response(response.body, response);
        cacheable.headers.set("Cache-Control", EDGE_CACHE_CONTROL);
        ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
        return withCacheStatus(cacheable, "MISS");
      }
      return response;
    }

    if (cacheUsable && isCacheableRequest(snapshot)) {
      const cache = caches.default;
      // The locale lives in the path (`/ar/menu`), so the pathname alone keys
      // the entry; no per-request locale variant is needed.
      const cacheKey = new Request(toCacheUrl(pathname), { method: "GET" });

      const hit = await cache.match(cacheKey);
      if (hit) return withCacheStatus(hit, "HIT");

      const response = await handler(request, env, ctx);
      if (response.status === 200 && isHtml(response)) {
        const cacheable = new Response(response.body, response);
        cacheable.headers.set("Cache-Control", EDGE_CACHE_CONTROL);
        ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
        return withCacheStatus(cacheable, "MISS");
      }
      // A failed render (1102 / 5xx) must not become the stored copy. If we hold
      // no stale copy to mask it with, surface it; the next successful render
      // caches, and `stale-if-error` covers the window once one exists.
      return response;
    }

    return handler(request, env, ctx);
  },
};

/** The cookie names a request carries, for the cache decision. */
function parseCookieNames(header) {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => part.slice(0, part.indexOf("=")).trim())
    .filter(Boolean);
}

function isHtml(response) {
  return (response.headers.get("content-type") ?? "").includes("text/html");
}

function isJson(response) {
  return (response.headers.get("content-type") ?? "").includes("application/json");
}

/** Marks a response as served from the edge cache. */
function withCacheStatus(response, status) {
  const headers = new Headers(response.headers);
  headers.set("x-edge-cache", status);
  return new Response(response.body, { status: response.status, headers });
}
