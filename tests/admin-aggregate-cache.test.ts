import { describe, expect, it, vi } from "vitest";
import { cachedAdminAggregate } from "@/lib/cache/admin-aggregate";

/**
 * Outside a request (a script, a cron route, `next build`) `unstable_cache` has
 * no incremental store and throws `Invariant: incrementalCache missing`. The
 * wrapper must treat exactly that as "caching unavailable" and run the function
 * directly, so an admin aggregate reader still works when a background job calls
 * it — but must NOT swallow any other error, or a real read failure would be
 * hidden behind a stale or empty result.
 */
describe("cachedAdminAggregate", () => {
  it("falls back to a direct call when the incremental cache is missing", async () => {
    const load = vi.fn(async (days: number) => ({ days }));
    const wrapped = cachedAdminAggregate(load, ["test-aggregate"], {
      revalidate: 5,
    });

    // No request scope in this test, so `unstable_cache` throws and the
    // fallback runs the underlying function once.
    await expect(wrapped(30)).resolves.toEqual({ days: 30 });
    expect(load).toHaveBeenCalledWith(30);
  });

  it("propagates a genuine failure rather than masking it", async () => {
    const sentinel = new Error("database is on fire");
    const wrapped = cachedAdminAggregate(
      async () => {
        throw sentinel;
      },
      ["test-aggregate-error"],
      { revalidate: 5 },
    );

    await expect(wrapped()).rejects.toBe(sentinel);
  });
});
