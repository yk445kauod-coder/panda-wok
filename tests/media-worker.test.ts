/**
 * The media worker serves dish photos from DBByte object storage, and the site
 * renders them through one stable origin.
 *
 * Two independent things are pinned here:
 *  1. the URL rewriting in `responsive.ts` — a Supabase Storage URL (legacy rows)
 *     and a DBByte/worker URL both resolve to the media worker host;
 *  2. the worker itself — a real fetch is exercised through the handler, so a
 *     regression in the DBByte read path fails here rather than in production.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { dishImageSrc, dishImageSrcSet, dishImageUrl } from "@/lib/images/responsive";
import worker from "../workers/media-proxy/src/index";

const ROOT = resolve(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const NAME = "dish-0d0d5089-3f4512b5-02d0-4932-85f7-ef26edaaff44.png";
const STORAGE = `https://xjbtsryidznsxqlynmfa.supabase.co/storage/v1/object/public/menu-images/${NAME}`;
const WORKER = `https://panda-wok-media.yk445kauod.workers.dev/media/${NAME}`;

const baseEnv = {
  DBBYTE_ENDPOINT: "https://api.dbbyte.com",
  DBBYTE_BUCKET: "panda-wok-media",
  DBBYTE_KEY: "dbk_test",
  SITE_ORIGIN: "https://panda-wok.pages.dev",
};

function call(env: Record<string, unknown>, path: string, init?: RequestInit): Promise<Response> {
  const ctx = { waitUntil: (_: Promise<unknown>) => {} };
  return worker.fetch(new Request("https://media.test" + path, init), env as never, ctx as never);
}

afterEach(() => vi.restoreAllMocks());

describe("dish photos are served by the media worker, not Supabase", () => {
  it("rewrites a Supabase Storage URL to the media worker host", () => {
    expect(dishImageSrc(STORAGE, 480)).toBe(WORKER);
  });

  it("emits one URL, not a width srcSet, for a proxied object", () => {
    expect(dishImageSrcSet(STORAGE)).not.toContain(" 480w");
    expect(dishImageSrcSet(STORAGE)).toContain("panda-wok-media");
  });

  it("leaves a media-worker URL untouched", () => {
    expect(dishImageSrc(WORKER, 480)).toBe(WORKER);
  });

  it("leaves other Supabase buckets untouched", () => {
    const other = STORAGE.replace("menu-images", "artifacts");
    expect(dishImageSrc(other, 480)).toBe(other);
  });

  it("still resizes Unsplash and ImageKit as before", () => {
    expect(dishImageSrc("https://images.unsplash.com/photo-123", 480)).toContain("w=480");
    expect(dishImageSrcSet("https://images.unsplash.com/photo-123")).toContain(" 1200w");
    expect(dishImageSrc("https://ik.imagekit.io/panda/hero.png", 1600)).toContain("w-1600");
  });

  it("routes og:image / JSON-LD through the worker too", () => {
    expect(dishImageUrl(STORAGE)).toBe(WORKER);
    expect(dishImageUrl("https://images.unsplash.com/photo-123")).toBe(
      "https://images.unsplash.com/photo-123",
    );
    expect(dishImageUrl(null)).toBe("");
  });
});

describe("the media worker reads DBByte", () => {
  it("fetches the object from DBByte and streams it back", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(bytes, { status: 200, headers: { "content-type": "image/png" } }));

    const res = await call(baseEnv, `/media/${NAME}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-media-source")).toBe("dbbyte");
    expect(res.headers.get("cache-control")).toContain("max-age=31536000");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(`https://api.dbbyte.com/storage/panda-wok-media/download/${NAME}`);
    expect((init as RequestInit | undefined)?.headers).toMatchObject({
      authorization: "Bearer dbk_test",
    });
  });

  it("never caches an upstream failure", async () => {
    const put = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("gone", { status: 404 }));
    const env = { ...baseEnv, __cache: { match: async () => undefined, put } };

    const res = await call(env, `/media/${NAME}`);

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a path-traversal name", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await call(baseEnv, "/media/..%2Fsecret.png");
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a method other than GET/HEAD", async () => {
    const res = await call(baseEnv, `/media/${NAME}`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it("answers a health probe", async () => {
    const res = await call(baseEnv, "/health");
    expect(res.status).toBe(200);
  });

  it("only purges with the worker's own secret", async () => {
    const noAuth = await call(baseEnv, `/purge?name=${NAME}`, { method: "POST" });
    expect(noAuth.status).toBe(403);
    const withAuth = await call(baseEnv, `/purge?name=${NAME}`, {
      method: "POST",
      headers: { authorization: "Bearer dbk_test" },
    });
    expect(withAuth.status).toBe(200);
  });
});

describe("the media worker is its own deployment, off the site worker", () => {
  it("has its own wrangler config pinned to the DBByte bucket", () => {
    const cfg = read("workers/media-proxy/wrangler.jsonc");
    expect(cfg).toContain('"panda-wok-media"');
    expect(cfg).toContain("DBBYTE_BUCKET");
    expect(cfg).not.toContain("SUPABASE_ORIGIN");
  });

  it("holds the DBByte key as a secret, never a var", () => {
    const cfg = read("workers/media-proxy/wrangler.jsonc");
    expect(cfg).not.toMatch(/"DBBYTE_KEY"\s*:/);
  });

  it("is not imported by the site's Pages worker", () => {
    const pagesWorker = read("scripts/pages/_worker.js");
    expect(pagesWorker).not.toContain("media-proxy");
  });
});
