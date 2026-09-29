import { describe, expect, it } from "vitest";

import {
  EDGE_CACHE_CONTROL,
  isCacheablePath,
  isCacheableRequest,
  localeVariant,
  toCacheUrl,
} from "../scripts/pages/edge-cache.js";

const anon = { method: "GET", pathname: "/menu", cookieNames: [] };

/**
 * The edge cache exists to absorb rush traffic on the public site. A wrong
 * "cacheable" here leaks one visitor's page to another, so every exclusion is
 * pinned; a wrong "not cacheable" merely costs origin capacity.
 */
describe("isCacheablePath", () => {
  it("allows the public pages", () => {
    for (const p of ["/", "/menu", "/menu/ramen", "/about", "/contact", "/faq", "/location", "/privacy-policy", "/cart"]) {
      expect(isCacheablePath(p)).toBe(true);
    }
  });

  it("rejects session, auth, admin and api paths", () => {
    for (const p of [
      "/account",
      "/account/addresses",
      "/checkout",
      "/orders",
      "/orders/123",
      "/loyalty",
      "/feedback",
      "/feedback/new",
      "/chat",
      "/auth/sign-in",
      "/admin",
      "/admin/orders",
      "/api/analytics",
    ]) {
      expect(isCacheablePath(p)).toBe(false);
    }
  });
});

describe("isCacheableRequest", () => {
  it("caches an anonymous public GET", () => {
    expect(isCacheableRequest(anon)).toBe(true);
  });

  it("never caches a signed-in visitor (any Supabase session cookie)", () => {
    expect(isCacheableRequest({ ...anon, cookieNames: ["sb-xjb-auth-token"] })).toBe(false);
    expect(isCacheableRequest({ ...anon, cookieNames: ["sb-xjb-auth-token.0"] })).toBe(false);
  });

  it("never caches the admin console", () => {
    expect(isCacheableRequest({ ...anon, cookieNames: ["panda-wok.admin"] })).toBe(false);
  });

  it("leaves locale and theme cookies cacheable (they are in the key/rendering)", () => {
    expect(isCacheableRequest({ ...anon, cookieNames: ["panda-wok.locale"] })).toBe(true);
  });

  it("does not cache non-GET, RSC or prefetch requests", () => {
    expect(isCacheableRequest({ ...anon, method: "POST" })).toBe(false);
    expect(isCacheableRequest({ ...anon, hasRscHeader: true })).toBe(false);
    expect(isCacheableRequest({ ...anon, hasPrefetchHeader: true })).toBe(false);
  });

  it("does not cache an authorised request", () => {
    expect(isCacheableRequest({ ...anon, hasAuthorization: true })).toBe(false);
  });

  it("does not cache the markdown-for-agents representation", () => {
    expect(isCacheableRequest({ ...anon, accept: "text/markdown" })).toBe(false);
  });

  it("does not cache private paths even when anonymous", () => {
    expect(isCacheableRequest({ ...anon, pathname: "/checkout" })).toBe(false);
    expect(isCacheableRequest({ ...anon, pathname: "/orders" })).toBe(false);
  });
});

describe("localeVariant", () => {
  it("prefers the explicit cookie", () => {
    expect(localeVariant({ cookieLocale: "ar", acceptLanguage: "en-US,en" })).toBe("ar");
    expect(localeVariant({ cookieLocale: "en", acceptLanguage: "ar" })).toBe("en");
  });

  it("falls back to Accept-Language, then English", () => {
    expect(localeVariant({ acceptLanguage: "ar-EG,ar;q=0.9" })).toBe("ar");
    expect(localeVariant({ acceptLanguage: "en-US,en;q=0.9" })).toBe("en");
    expect(localeVariant({})).toBe("en");
  });
});

describe("toCacheUrl", () => {
  it("separates locales into distinct cache keys", () => {
    const en = toCacheUrl("https://panda-wok.pages.dev/menu", "en");
    const ar = toCacheUrl("https://panda-wok.pages.dev/menu", "ar");
    expect(en).not.toBe(ar);
    expect(new URL(en).searchParams.get("__pw_lang")).toBe("en");
  });
});

describe("EDGE_CACHE_CONTROL", () => {
  it("uses a short fresh window with stale-while-revalidate", () => {
    expect(EDGE_CACHE_CONTROL).toContain("s-maxage=60");
    expect(EDGE_CACHE_CONTROL).toContain("stale-while-revalidate=300");
    expect(EDGE_CACHE_CONTROL).toContain("stale-if-error=600");
  });
});
