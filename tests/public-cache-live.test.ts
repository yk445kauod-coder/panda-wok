import { describe, expect, it } from "vitest";

/**
 * The public readers must resolve outside a request scope. This is the case that
 * actually broke: `unstable_cache` throws `Invariant: incrementalCache missing`
 * there, and the scheduled ops agent and cron handlers call these same readers
 * with no request. `cachedPublic` falls back to the direct query, so the call
 * succeeds — proven here against the live project (skipped without `.env.local`).
 */
const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!hasEnv)("public readers outside a request scope", () => {
  it("reads settings through the fallback path", async () => {
    const { getPublicSettings } = await import("@/lib/services/catalog");
    const settings = await getPublicSettings();
    expect(settings.brand.name.length).toBeGreaterThan(0);
  });

  it("reads the menu through the fallback path", async () => {
    const { getPublicMenu } = await import("@/lib/services/catalog");
    const menu = await getPublicMenu();
    expect(Array.isArray(menu.categories)).toBe(true);
    expect(Array.isArray(menu.items)).toBe(true);
  });
});
