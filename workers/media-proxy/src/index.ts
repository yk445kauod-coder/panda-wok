/**
 * Panda Wok media proxy worker.
 *
 * Serves dish photography from Supabase Storage through Cloudflare's cache, so
 * the project's scarce resource — Storage egress — is spent once per object
 * instead of once per visitor.
 *
 * Why this is a separate Worker and not a route on the site's Pages worker:
 * the site worker is the OpenNext/Next.js server. On the Free plan it has a 10 ms
 * CPU budget per request, and every image request that reached it would run that
 * whole bundle (env resolution, middleware matching, the Next request pipeline)
 * just to hand back a byte stream — while competing for the same per-account
 * request budget that Error 1102s come from. This worker is a few kilobytes: a
 * cache lookup, and on a miss a single `fetch` piped straight through. A menu
 * page with 48 photos therefore costs the site worker *nothing* for the images.
 *
 * Measured motivation: 1.17 GB of Storage egress in 24 hours from ~1,500 requests
 * (average 775 KB an image) — 99.99% of the project's total, and what exhausted
 * the Free plan's cached-egress quota until every API call answered 402.
 *
 * Public GET only. `SUPABASE_ORIGIN` and `MEDIA_BUCKET` are the only things it
 * will fetch from, and the object name is checked against the exact pattern the
 * uploader mints, so it cannot be used as an open proxy or to reach another path.
 */

export interface Env {
  SUPABASE_ORIGIN: string;
  MEDIA_BUCKET: string;
  SITE_ORIGIN?: string;
}

/** The exact shape `uploadMenuImageAction` writes: `dish-<8 hex>-<uuid>.<ext>`. */
const OBJECT_NAME =
  /^dish-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|jpeg|webp|avif)$/i;

/** A year. A dish photo is immutable — a re-upload mints a new UUID. */
const MEDIA_TTL_SECONDS = 31536000;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

export default {
  async fetch(
    request: Request,
    env: Env,
    // `ExecutionContext` lives in `@cloudflare/workers-types`, which this repo
    // does not depend on; only `waitUntil` is used here.
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health probe for the deploy step and for uptime checks.
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "cache-control": "no-store" } });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    // Accepted on both `/media/<name>` (the URL the site emits) and `/<name>`
    // (when the site is later rewritten to point straight at this worker's host).
    const name = decodeURIComponent(
      url.pathname.startsWith("/media/")
        ? url.pathname.slice("/media/".length)
        : url.pathname.slice(1),
    );

    if (!OBJECT_NAME.test(name)) {
      return new Response("Not found", { status: 404 });
    }

    const origin = `${env.SUPABASE_ORIGIN}/storage/v1/object/public/${env.MEDIA_BUCKET}/${name}`;
    // The origin URL is the cache key, so query-string variants (`?v=2`) resolve
    // to the same stored object.
    const cacheKey = new Request(origin, { method: "GET" });
    const cache =
      typeof caches !== "undefined"
        ? (caches as unknown as { default: Cache }).default
        : null;

    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return withStatus(hit, "HIT");
    }

    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    const upstream = await fetch(origin, {
      headers: { accept: MIME[ext] ?? "image/*" },
      // `cf` is a Cloudflare fetch extension, absent from the DOM `RequestInit`.
      cf: { cacheTtl: MEDIA_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);

    if (!upstream.ok || !upstream.body) {
      // Never cache a failure: a transient Storage error must not become the
      // stored copy for a year. 402/429 surface as-is so the quota is visible.
      return new Response("Image unavailable", {
        status: upstream.status === 404 ? 404 : upstream.status >= 500 ? 502 : upstream.status,
        headers: { "cache-control": "no-store" },
      });
    }

    const headers = new Headers({
      "content-type":
        upstream.headers.get("content-type") ?? MIME[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": env.SITE_ORIGIN ?? "*",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);

    const response = new Response(upstream.body, { status: 200, headers });
    if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withStatus(response, "MISS");
  },
};

function withStatus(response: Response, status: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-media-cache", status);
  return new Response(response.body, { status: response.status, headers });
}
