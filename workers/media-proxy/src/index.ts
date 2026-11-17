/**
 * Panda Wok media worker — serves dish photography from DBByte object storage.
 *
 * Why a separate Worker and not a route on the site's Pages/OpenNext worker:
 * the site worker is the whole Next.js server. On the Free plan it has a 10 ms
 * CPU budget per request, and every image request that reached it would run that
 * bundle (env resolution, middleware, the Next pipeline) just to hand back a
 * byte stream — while competing for the same per-account request budget that
 * Error 1102s come from. This worker is a few kilobytes: one cache lookup, or one
 * `fetch` piped straight through. A menu page with 48 photos therefore costs the
 * site worker *nothing* for the images.
 *
 * Reads only, public GET. The bucket is private: each read is SigV4-signed with
 * the S3 key held here as a Worker secret, so the browser never sees the key and
 * the object store stays closed. The object name is checked against a strict
 * pattern, so the worker cannot be used as an open proxy.
 */

import { AwsClient } from "aws4fetch";

export interface Env {
  /** DBByte S3 endpoint. Not a secret; overridable per environment. */
  DBBYTE_ENDPOINT?: string;
  /** The one bucket this worker reads from. */
  DBBYTE_BUCKET: string;
  /** `dbs_...` access key id. Not secret by itself, but paired with the key below. */
  DBBYTE_ACCESS_KEY_ID: string;
  /** `dbk_...` secret access key. A Worker secret — never shipped to the browser. */
  DBBYTE_SECRET_ACCESS_KEY: string;
  /**
   * Legacy name from the REST-gateway era. It is the same `dbk_...` value, so an
   * environment that still carries it keeps serving photos across the S3 switch
   * without a second secret having to be provisioned.
   */
  DBBYTE_KEY?: string;
  /** The site's own origin, so only the site (and the browser) may use the proxy. */
  SITE_ORIGIN?: string;
}

/**
 * A dish photo name. Two shapes exist: the current uploader mints
 * `dish-<8 hex>-<uuid>.<ext>`, and legacy rows carry `dish-<uuid>.<ext>`. Both
 * are accepted, plus any plain `name.ext` the admin pastes — but a path
 * separator, a `..` segment or a leading dot is refused, so a crafted name
 * cannot escape the bucket or reach another route.
 */
const OBJECT_NAME =
  /^(?!\.)(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:png|jpe?g|webp|avif|gif|svg)$/i;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
};

const worker = {
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

    // Purge one object from the edge cache. Names are content-addressed (a new
    // upload mints a new name), so this exists for the "replace in place" case
    // only. Guarded by the worker's own secret, and it can only ever drop a
    // cache entry.
    if (request.method === "POST" && url.pathname === "/purge") {
      const auth = request.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${secretKey(env)}`) {
        return new Response("Forbidden", { status: 403 });
      }
      const name = url.searchParams.get("name") ?? "";
      if (!OBJECT_NAME.test(name)) return new Response("Bad name", { status: 400 });
      const cache = cacheStore();
      if (cache) await cache.delete(cacheKeyFor(env, name));
      return new Response("ok", { status: 200, headers: { "cache-control": "no-store" } });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    // Accepted on both `/media/<name>` (the URL the site emits) and `/<name>`.
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
    const cache = cacheStore();
    const key = cacheKeyFor(env, name);

    if (cache) {
      const hit = await cache.match(key);
      if (hit) return withStatus(hit, "HIT");
    }

    // DBByte speaks the S3 protocol: an object is a plain GET of
    // `<endpoint>/<bucket>/<name>`, SigV4-signed. The bucket is private, so the
    // signature is what authorises the read; the key never leaves the server.
    const s3 = new AwsClient({
      accessKeyId: env.DBBYTE_ACCESS_KEY_ID,
      secretAccessKey: secretKey(env),
      service: "s3",
      region: S3_REGION,
    });
    const origin = `${dbbyteEndpoint(env)}/${encodeURIComponent(
      env.DBBYTE_BUCKET,
    )}/${encodeURIComponent(name)}`;

    let upstream: Response;
    try {
      upstream = await s3.fetch(origin, { method: "GET" });
    } catch {
      return new Response("Image unavailable", {
        status: 502,
        headers: { "cache-control": "no-store" },
      });
    }

    if (!upstream.ok || !upstream.body) {
      // Never cache a failure: a transient store error must not become the
      // stored copy for a year.
      return new Response("Image unavailable", {
        status: upstream.status === 404 ? 404 : upstream.status >= 500 ? 502 : upstream.status,
        headers: { "cache-control": "no-store" },
      });
    }

    const headers = new Headers({
      "content-type": upstream.headers.get("content-type") ?? mime,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": env.SITE_ORIGIN ?? "*",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);

    const response = new Response(upstream.body, { status: 200, headers });
    if (cache) ctx.waitUntil(cache.put(key, response.clone()));
    return withStatus(response, "MISS");
  },
};

/** The DBByte S3 endpoint, default filled in and trailing slashes trimmed. */
function dbbyteEndpoint(env: Env): string {
  return (env.DBBYTE_ENDPOINT ?? "https://s3.dbbyte.com").replace(/\/+$/, "");
}

/** DBByte's S3 signature region. Fixed by the provider, not per deployment. */
const S3_REGION = "us-east-1";

/**
 * The `dbk_...` secret. `DBBYTE_KEY` is the legacy name carried over from the
 * REST-gateway era — the same value — so a Worker that has not yet been given
 * the new secret keeps signing reads instead of 502ing on every photo.
 */
function secretKey(env: Env): string {
  return env.DBBYTE_SECRET_ACCESS_KEY ?? env.DBBYTE_KEY ?? "";
}

/**
 * The edge-cache key for one object. A fixed origin is used rather than the
 * request host, so an object has exactly one key regardless of how it was
 * requested and a purge is deterministic.
 */
function cacheKeyFor(env: Env, name: string): Request {
  return new Request(`https://media.cache.internal/${env.DBBYTE_BUCKET}/${name}`, {
    method: "GET",
  });
}

function cacheStore(): Cache | null {
  return typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : null;
}

function withStatus(response: Response, status: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-media-source", "dbbyte-s3");
  headers.set("x-media-cache", status);
  return new Response(response.body, { status: response.status, headers });
}

export default worker;
