import opennext from "./opennext-worker.js";
import {
  EDGE_CACHE_CONTROL,
  isCacheableRequest,
  localeVariant,
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

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (SERVER_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return new Response("Not found", { status: 404 });
    }

    const looksLikeAsset =
      ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
      ASSET_FILE.test(pathname);

    if (looksLikeAsset && typeof env?.ASSETS !== "undefined") {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }

    const handler = opennext.fetch ?? opennext.default?.fetch;

    // Edge cache for anonymous public pages. During a rush this is the
    // difference between every hit running the Worker and the CDN answering
    // them: only a miss or a stale hit reaches Next, and a stale page is served
    // immediately while it revalidates in the background.
    if (typeof caches !== "undefined" && caches.default) {
      const snapshot = {
        method: request.method,
        pathname,
        cookieNames: parseCookieNames(request.headers.get("cookie")),
        acceptLanguage: request.headers.get("accept-language"),
        accept: request.headers.get("accept"),
        hasRscHeader: request.headers.has("rsc"),
        hasPrefetchHeader:
          request.headers.has("next-router-prefetch") ||
          request.headers.has("next-router-state-tree"),
        hasAuthorization: request.headers.has("authorization"),
      };

      if (isCacheableRequest(snapshot)) {
        const url = new URL(request.url);
        const variant = localeVariant({
          cookieLocale: cookieValue(request.headers.get("cookie"), "panda-wok.locale"),
          acceptLanguage: request.headers.get("accept-language"),
        });
        url.searchParams.set("__pw_lang", variant);
        const cacheKey = new Request(url.toString(), { method: "GET" });
        const cache = caches.default;

        const hit = await cache.match(cacheKey);
        if (hit) return withCacheStatus(hit, "HIT");

        const response = await handler(request, env, ctx);
        if (response.status === 200 && isHtml(response)) {
          const cacheable = new Response(response.body, response);
          cacheable.headers.set("Cache-Control", EDGE_CACHE_CONTROL);
          ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
          return withCacheStatus(cacheable, "MISS");
        }
        return response;
      }
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

/** One cookie's value, or undefined. */
function cookieValue(header, name) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

function isHtml(response) {
  return (response.headers.get("content-type") ?? "").includes("text/html");
}

/** Marks whether Cloudflare served this copy from the edge cache. */
function withCacheStatus(response, status) {
  const headers = new Headers(response.headers);
  headers.set("x-edge-cache", status);
  return new Response(response.body, { status: response.status, headers });
}
