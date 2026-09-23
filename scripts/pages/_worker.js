import opennext from "./opennext-worker.js";

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
const ASSET_FILE =
  /\.(?:svg|png|jpg|jpeg|webp|avif|ico|gif|css|js|mjs|woff2?|ttf|txt|xml|webmanifest|json|map)$/i;

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
    return handler(request, env, ctx);
  },
};
