import { describe, expect, it, vi } from "vitest";

/**
 * The public env module is deliberately dependency-free: it must not pull zod
 * into the middleware bundle, which is what pushed routine renders past the
 * Free-plan CPU cap (Error 1102). These tests pin that behaviour and the
 * failure mode for a missing value.
 */
describe("publicEnv", () => {
  it("reads the Supabase URL and key from process.env", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "a".repeat(40));

    const { publicEnv } = await import("@/lib/config/public-env");

    expect(publicEnv.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("a".repeat(40));
    vi.unstubAllEnvs();
  });

  it("defaults the site URL when unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const { publicEnv } = await import("@/lib/config/public-env");
    expect(publicEnv.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    vi.unstubAllEnvs();
  });

  it("names the missing key when the Supabase URL is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { publicEnv } = await import("@/lib/config/public-env");
    expect(() => publicEnv.NEXT_PUBLIC_SUPABASE_URL).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
    vi.unstubAllEnvs();
  });

  it("does not import zod", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/config/public-env.ts", "utf8"),
    );
    expect(source).not.toMatch(/from ["']zod["']/);
  });
});
