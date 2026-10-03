import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `cachedPublic` exists because Next's `unstable_cache` throws when there is no
 * request-scoped incremental cache — `Invariant: incrementalCache missing`.
 * The scheduled ops agent, cron handlers and scripts call the same catalogue and
 * settings readers that pages do, so a throw there would break the agent while
 * every page still looked fine.
 *
 * These tests pin the two halves of the contract: a missing store falls back to
 * the uncached read, and a genuine read failure still propagates (so the
 * fallback can never hide a data bug).
 */
const unstableCache = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (...args: unknown[]) => unstableCache(...args),
}));

const { cachedPublic } = await import("@/lib/cache/public-cache");

afterEach(() => {
  vi.clearAllMocks();
});

describe("cachedPublic", () => {
  it("returns the cached value when a cache store is present", async () => {
    unstableCache.mockReturnValue(async () => "cached");
    const fn = vi.fn(async () => "direct");

    const wrapped = cachedPublic(fn, ["k"], { revalidate: 600, tags: ["t"] });

    await expect(wrapped()).resolves.toBe("cached");
    expect(fn).not.toHaveBeenCalled();
  });

  it("falls back to the uncached read when the store is missing", async () => {
    unstableCache.mockReturnValue(async () => {
      throw new Error(
        "Invariant: incrementalCache missing in unstable_cache async function load()",
      );
    });
    const fn = vi.fn(async () => "direct");

    const wrapped = cachedPublic(fn, ["k"], { revalidate: 600, tags: ["t"] });

    await expect(wrapped()).resolves.toBe("direct");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("still propagates a real read failure", async () => {
    unstableCache.mockReturnValue(async () => {
      throw new Error("Failed to load settings: connection refused");
    });
    const fn = vi.fn(async () => "direct");

    const wrapped = cachedPublic(fn, ["k"], { revalidate: 600, tags: ["t"] });

    await expect(wrapped()).rejects.toThrow("connection refused");
    expect(fn).not.toHaveBeenCalled();
  });
});
