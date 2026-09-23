import opennext from "./opennext-worker.js";

/**
 * Pages entrypoint. Pages advanced mode does not serve the assets directory
 * automatically, so anything that looks like a static file is offered to the
 * `ASSETS` binding first and only falls through to Next when it is absent.
 * Without this the site renders but every CSS/JS/asset request 404s.
 */
const ASSET_PREFIXES = ["/_next/static/", "/mascots/"];
const ASSET_FILE =
  /\.(?:svg|png|jpg|jpeg|webp|avif|ico|gif|css|js|mjs|woff2?|ttf|txt|xml|webmanifest|json|map)$/i;

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
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
