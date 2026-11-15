import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { dishImageSrc, dishImageSrcSet } from "@/lib/images/responsive";

const ROOT = resolve(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const STORAGE =
  "https://xjbtsryidznsxqlynmfa.supabase.co/storage/v1/object/public/menu-images/dish-0d0d5089-3f4512b5-02d0-4932-85f7-ef26edaaff44.png";

describe("dish photos are served by the media worker, not Supabase", () => {
  it("rewrites a Supabase Storage URL to the media worker host", () => {
    expect(dishImageSrc(STORAGE, 480)).toBe(
      "https://panda-wok-media.yk445kauod.workers.dev/media/dish-0d0d5089-3f4512b5-02d0-4932-85f7-ef26edaaff44.png",
    );
  });

  it("emits one URL, not a width srcSet, for a proxied object", () => {
    expect(dishImageSrcSet(STORAGE)).not.toContain(" 480w");
    expect(dishImageSrcSet(STORAGE)).toContain("panda-wok-media");
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
});

describe("the media worker is its own deployment, off the site worker", () => {
  it("has its own wrangler config, pinned to the public bucket", () => {
    const cfg = read("workers/media-proxy/wrangler.jsonc");
    expect(cfg).toContain('"panda-wok-media"');
    expect(cfg).toContain("menu-images");
  });

  it("only serves the object pattern the uploader mints", () => {
    const src = read("workers/media-proxy/src/index.ts");
    expect(src).toMatch(/dish-\[0-9a-f\]\{8\}/);
    // No wildcard: the proxy must not become an open fetch for any path.
    expect(src).not.toMatch(/pathname\.slice\(1\)\s*$/m);
  });

  it("never caches an upstream failure", () => {
    const src = read("workers/media-proxy/src/index.ts");
    expect(src).toMatch(/if \(!upstream\.ok/);
    expect(src).toMatch(/"cache-control": "no-store"/);
  });

  it("is not imported by the site's Pages worker", () => {
    const worker = read("scripts/pages/_worker.js");
    expect(worker).not.toContain("image-proxy");
    expect(worker).not.toContain("serveMedia");
  });
});
