/**
 * Panda Wok media worker.
 *
 * Serves dish photography from the deployment's own R2 bucket, and — until R2 is
 * enabled and the objects are migrated — from Supabase Storage through
 * Cloudflare's cache. Either way the project's scarce resource (Storage egress)
 * is spent at most once per object instead of once per visitor.
 *
 * Why this is a separate Worker and not a route on the site's Pages worker:
 * the site worker is the OpenNext/Next.js server. On the Free plan it has a 10 ms
 * CPU budget per request, and every image request that reached it would run that
 * whole bundle (env resolution, middleware matching, the Next request pipeline)
 * just to hand back a byte stream — while competing for the same per-account
 * request budget that Error 1102s come from. This worker is a few kilobytes: an
 * R2 read, or a cache lookup and a single `fetch` piped straight through. A menu
 * page with 48 photos therefore costs the site worker *nothing* for the images.
 *
 * Measured motivation: 1.17 GB of Storage egress in 24 hours from ~1,500 requests
 * (average 775 KB an image) — 99.99% of the project's total, and what exhausted
 * the Free plan's cached-egress quota until every API call answered 402.
 *
 * Public GET only. `SUPABASE_ORIGIN`/`SUPABASE_BUCKET` and the R2 bucket are the
 * only things it will read from, and the object name is checked against the exact
 * pattern the uploader mints, so it cannot be used as an open proxy or to reach
 * another path.
 */

export interface Env {
  SUPABASE_ORIGIN: string;
  SUPABASE_BUCKET: string;
  SITE_ORIGIN?: string;
  /**
   * The deployment's own R2 bucket. Optional: R2 must be enabled on the account
   * and the bucket created before the binding resolves, so when it is absent the
   * worker still serves the same objects from Supabase Storage.
   */
  MEDIA?: {
    get(key: string): Promise<{
      body: ReadableStream | null;
      httpMetadata?: { contentType?: string; cacheControl?: string };
    } | null>;
  };
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

    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";

    // Serve from the deployment's own R2 bucket first. This is the store uploads
    // write to once R2 is enabled, and reading it costs no Supabase egress — the
    // quota whose exhaustion 402'd the whole project.
    if (env.MEDIA) {
      try {
        const object = await env.MEDIA.get(name);
        if (object) {
          return new Response(object.body, {
            status: 200,
            headers: {
              "content-type": object.httpMetadata?.contentType ?? mime,
              "cache-control": object.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable",
              "x-content-type-options": "nosniff",
              "access-control-allow-origin": env.SITE_ORIGIN ?? "*",
              "x-media-source": "r2",
            },
          });
        }
      } catch {
        // A bucket that is not there yet must not take the site down; fall
        // through to the Storage origin, which may still hold the object.
      }
    }

    const origin = `${env.SUPABASE_ORIGIN}/storage/v1/object/public/${env.SUPABASE_BUCKET}/${name}`;
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

    const upstream = await fetch(origin, {
      headers: { accept: mime },
      // `cf` is a Cloudflare fetch extension, absent from the DOM `RequestInit`.
      cf: { cacheTtl: MEDIA_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);

    if (!upstream.ok || !upstream.body) {
      // Never cache a failure: a transient Storage error must not become the
      // stored copy for a year.
      //
      // A 402 is Supabase restricting the whole project (the cached-egress quota
      // is spent). That is temporary — it lifts at the billing reset — but while
      // it lasts every dish photo would render as the browser's broken-image
      // glyph. Hand back the site's own placeholder instead so a customer sees a
      // tidy page rather than a broken one, and keep the redirect out of caches
      // so the real photo reappears on its own the moment Storage answers again.
      if (upstream.status === 402 || upstream.status === 429) {
        return new Response(null, {
          status: 302,
          headers: {
            location: `${env.SITE_ORIGIN ?? ""}/dish-placeholder.svg`,
            "cache-control": "no-store",
            "x-media-cache": "UNAVAILABLE",
          },
        });
      }
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
