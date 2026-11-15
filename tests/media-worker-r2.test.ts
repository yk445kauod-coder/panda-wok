import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../workers/media-proxy/src/index";

const NAME = "dish-0d0d5089-3f4512b5-02d0-4932-85f7-ef26edaaff44.png";
const URL_MEDIA = `https://panda-wok-media.example.workers.dev/media/${NAME}`;

const baseEnv = {
  SUPABASE_ORIGIN: "https://project.supabase.co",
  SUPABASE_BUCKET: "menu-images",
  SITE_ORIGIN: "https://panda-wok.pages.dev",
};

function call(env: Record<string, unknown>, url = URL_MEDIA): Promise<Response> {
  const request = new Request(url);
  const ctx = { waitUntil: (_: Promise<unknown>) => {} };
  return worker.fetch(request, env as never, ctx as never);
}

afterEach(() => vi.restoreAllMocks());

describe("media worker serves dish photos from R2 when the bucket is bound", () => {
  it("returns the R2 object and never touches the Storage origin", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const env = {
      ...baseEnv,
      MEDIA: {
        get: async () => ({
          body: new Response("r2-bytes").body,
          httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=60" },
        }),
      },
    };

    const response = await call(env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-media-source")).toBe("r2");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls through to Storage when R2 has no such object", async () => {
    const upstream = new Response("supabase-bytes", {
      status: 200,
      headers: { "content-type": "image/png", "content-length": "14" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(upstream);
    const env = { ...baseEnv, MEDIA: { get: async () => null } };

    const response = await call(env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-media-source")).toBeNull();
    expect(response.headers.get("x-media-cache")).toBe("MISS");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("does not take the site down when the R2 bucket is missing or errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("supabase-bytes", { status: 200, headers: { "content-type": "image/png" } }),
    );
    const env = {
      ...baseEnv,
      MEDIA: {
        get: async () => {
          throw new Error("bucket does not exist");
        },
      },
    };

    const response = await call(env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-media-source")).toBeNull();
  });
});
