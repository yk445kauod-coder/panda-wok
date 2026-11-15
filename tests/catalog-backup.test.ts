import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The KV safety net behind every public read.
 *
 * When Supabase fails — an outage, or the org's egress quota spent so every call
 * answers 402 — the storefront must serve the last known-good copy rather than
 * 500. These pin the store's own behaviour: the throttle, the parse guard, and
 * that a store failure never propagates into a render.
 */

const store = new Map<string, string>();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      NEXT_INC_CACHE_KV: {
        get: async (key: string) => store.get(key) ?? null,
        put: async (key: string, value: string) => {
          store.set(key, value);
        },
      },
    },
  }),
}));

const { readBackup, saveBackup } = await import("@/lib/cache/catalog-backup");

describe("catalog backup store", () => {
  beforeEach(() => store.clear());

  it("round-trips a value", async () => {
    await saveBackup("public-restaurant", { id: "r1", name: "Panda Wok" });
    expect(await readBackup("public-restaurant")).toEqual({ id: "r1", name: "Panda Wok" });
  });

  it("returns undefined when nothing is stored", async () => {
    // A key absent from the bundled seed, so this exercises KV alone.
    expect(await readBackup("public-no-such-read")).toBeUndefined();
  });

  it("distinguishes a stored null from no backup", async () => {
    await saveBackup("public-category-by-slug", null, ["not-a-category"]);
    expect(await readBackup("public-category-by-slug", ["not-a-category"])).toBeNull();
    expect(await readBackup("public-category-by-slug", ["other"])).toBeUndefined();
  });

  it("keeps each argument's copy separate", async () => {
    await saveBackup("public-menu-item-by-slug", { slug: "wasabi" }, ["wasabi"]);
    await saveBackup("public-menu-item-by-slug", { slug: "beef" }, ["beef"]);
    expect(await readBackup("public-menu-item-by-slug", ["wasabi"])).toEqual({ slug: "wasabi" });
    expect(await readBackup("public-menu-item-by-slug", ["beef"])).toEqual({ slug: "beef" });
  });

  it("does not rewrite inside the refresh floor", async () => {
    await saveBackup("public-categories", ["first"]);
    await saveBackup("public-categories", ["second"]);
    expect(await readBackup("public-categories")).toEqual(["first"]);
  });

  it("overwrites once the stored copy is older than the floor", async () => {
    store.set(
      "catalog-backup:public-categories",
      JSON.stringify({ at: Date.now() - 7 * 60 * 60 * 1000, value: ["old"] }),
    );
    await saveBackup("public-categories", ["fresh"]);
    expect(await readBackup("public-categories")).toEqual(["fresh"]);
  });

  it("treats a corrupt stored value as no backup, never a throw", async () => {
    store.set("catalog-backup:public-no-such-read", "{not json");
    await expect(readBackup("public-no-such-read")).resolves.toBeUndefined();
  });
});
