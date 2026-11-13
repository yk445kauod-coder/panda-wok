import { afterEach, describe, expect, it, vi } from "vitest";

import resilientIncrementalCache from "@/lib/cache/incremental-cache";
import { CACHE_TAGS, PUBLIC_DATA_REVALIDATE } from "@/lib/cache/tags";

/**
 * The incremental cache is the difference between "caching on Cloudflare" and
 * "every page 500s". Next calls it for every `unstable_cache` read, and does
 * *not* catch a throw from it, so a missing KV binding would take the menu and
 * home page down. These tests pin the contract that matters: with no binding the
 * cache is a miss, never an exception, and with a binding the stock KV cache is
 * used.
 *
 * `@opennextjs/cloudflare` is mocked because the real `getCloudflareContext()`
 * reads a request-scoped symbol that only exists inside the Worker runtime. The
 * mock reproduces exactly the two states that matter: context present with a KV
 * namespace, and context present without one.
 */
const getCloudflareContext = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...args: unknown[]) => getCloudflareContext(...args),
}));

// `vi.mock` factories are hoisted above the imports, so the spies have to be
// created with `vi.hoisted` or the factory closes over uninitialised bindings.
const { kvGet, kvSet, kvDelete, staticGet } = vi.hoisted(() => ({
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  kvDelete: vi.fn(),
  staticGet: vi.fn().mockResolvedValue(null),
}));

vi.mock(
  "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache",
  () => ({
    BINDING_NAME: "NEXT_INC_CACHE_KV",
    // The wrapper adopts the stock name so `populateCache` recognises it.
    NAME: "cf-kv-incremental-cache",
    default: { get: kvGet, set: kvSet, delete: kvDelete },
  }),
);

vi.mock(
  "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache",
  () => ({
    default: { get: staticGet },
  }),
);

afterEach(() => {
  vi.clearAllMocks();
  staticGet.mockResolvedValue(null);
});

describe("resilient incremental cache", () => {
  it("returns a miss, and touches no KV, when the binding is absent", async () => {
    getCloudflareContext.mockReturnValue({ env: {} });

    await expect(resilientIncrementalCache.get("menu")).resolves.toBeNull();
    await expect(
      resilientIncrementalCache.set("menu", { kind: "PAGE" } as never),
    ).resolves.toBeUndefined();
    await expect(resilientIncrementalCache.delete("menu")).resolves.toBeUndefined();

    expect(kvGet).not.toHaveBeenCalled();
    expect(kvSet).not.toHaveBeenCalled();
    expect(kvDelete).not.toHaveBeenCalled();
    // No KV, so the bundled static-assets copy is the only store left to try.
    expect(staticGet).toHaveBeenCalledWith("menu", undefined);
  });

  it("never throws when there is no request context at all", async () => {
    getCloudflareContext.mockImplementation(() => {
      throw new Error("getCloudflareContext has been called without a context");
    });

    await expect(resilientIncrementalCache.get("menu")).resolves.toBeNull();
    await expect(
      resilientIncrementalCache.set("menu", { kind: "PAGE" } as never),
    ).resolves.toBeUndefined();
    await expect(resilientIncrementalCache.delete("menu")).resolves.toBeUndefined();
  });

  it("falls back to the bundled static-assets cache when KV misses", async () => {
    getCloudflareContext.mockReturnValue({ env: { NEXT_INC_CACHE_KV: {} } });
    kvGet.mockResolvedValue(null);
    staticGet.mockResolvedValue({ value: { kind: "PAGE" }, lastModified: 2 });

    await expect(resilientIncrementalCache.get("menu", "cache")).resolves.toEqual({
      value: { kind: "PAGE" },
      lastModified: 2,
    });
    expect(kvGet).toHaveBeenCalledWith("menu", "cache");
    expect(staticGet).toHaveBeenCalledWith("menu", "cache");
  });

  it("prefers the KV entry when both stores hold one, so edits win", async () => {
    getCloudflareContext.mockReturnValue({ env: { NEXT_INC_CACHE_KV: {} } });
    kvGet.mockResolvedValue({ value: { kind: "PAGE", fresh: true }, lastModified: 9 });

    const result = await resilientIncrementalCache.get("menu", "cache");
    expect(result).toEqual({ value: { kind: "PAGE", fresh: true }, lastModified: 9 });
    expect(staticGet).not.toHaveBeenCalled();
  });

  it("delegates to the KV cache once the namespace is bound", async () => {
    getCloudflareContext.mockReturnValue({ env: { NEXT_INC_CACHE_KV: {} } });
    kvGet.mockResolvedValue({ value: { kind: "PAGE" }, lastModified: 1 });

    await expect(resilientIncrementalCache.get("menu", "cache")).resolves.toEqual({
      value: { kind: "PAGE" },
      lastModified: 1,
    });
    expect(kvGet).toHaveBeenCalledWith("menu", "cache");

    await resilientIncrementalCache.set("menu", { kind: "PAGE" } as never, "cache");
    expect(kvSet).toHaveBeenCalledWith("menu", { kind: "PAGE" }, "cache");
  });
});

describe("public cache tags", () => {
  it("keeps tags unique so an invalidation cannot hit the wrong slice", () => {
    const tags = Object.values(CACHE_TAGS);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.every((tag) => tag.startsWith("public:"))).toBe(true);
  });

  it("uses a revalidate window measured in minutes, not seconds", () => {
    expect(PUBLIC_DATA_REVALIDATE).toBeGreaterThanOrEqual(60);
  });
});
