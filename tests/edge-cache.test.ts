import { describe, expect, it } from "vitest";

import {
  ADMIN_SHELL_CACHE_CONTROL,
  EDGE_CACHE_CONTROL,
  adminShellCacheUrl,
  cacheKeysFor,
  isAdminShellPath,
  isAdminShellRequest,
  isCacheablePath,
  isCacheableRequest,
  purgePublicCache,
  shouldPurgeAfter,
  toCacheUrl,
} from "../scripts/pages/edge-cache.js";

const anon = { method: "GET", pathname: "/en/menu", cookieNames: [] };

/**
 * The edge cache exists to absorb rush traffic on the public site. A wrong
 * "cacheable" here leaks one visitor's page to another, so every exclusion is
 * pinned; a wrong "not cacheable" merely costs origin capacity.
 */
describe("isCacheablePath", () => {
  it("allows the public pages in both locales", () => {
    for (const bare of ["/", "/menu", "/menu/ramen", "/about", "/contact", "/faq", "/location", "/privacy-policy", "/cart"]) {
      for (const locale of ["en", "ar"]) {
        const p = `/${locale}${bare === "/" ? "" : bare}`;
        expect(isCacheablePath(p), p).toBe(true);
      }
    }
  });

  it("rejects a bare public path that was never localised", () => {
    // A bare path is only ever a redirect, never a page to store.
    expect(isCacheablePath("/menu")).toBe(false);
    expect(isCacheablePath("/")).toBe(false);
  });

  it("rejects session, auth, admin and api paths", () => {
    for (const p of [
      "/en/account",
      "/en/account/addresses",
      "/en/checkout",
      "/en/orders",
      "/en/orders/123",
      "/en/loyalty",
      "/en/feedback",
      "/en/feedback/new",
      "/en/chat",
      "/auth/sign-in",
      "/admin",
      "/admin/orders",
      "/api/analytics",
    ]) {
      expect(isCacheablePath(p), p).toBe(false);
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
    // HEAD is not a document fetch; caching it would also poison the key.
    expect(isCacheableRequest({ ...anon, method: "HEAD" })).toBe(false);
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
    expect(isCacheableRequest({ ...anon, pathname: "/en/checkout" })).toBe(false);
    expect(isCacheableRequest({ ...anon, pathname: "/ar/orders" })).toBe(false);
  });
});

describe("toCacheUrl", () => {
  it("keys by the locale-prefixed path, so the two locales never collide", () => {
    expect(toCacheUrl("/en/menu")).not.toBe(toCacheUrl("/ar/menu"));
    expect(toCacheUrl("/en/menu")).toBe("https://edge.cache.internal/en/menu");
  });
});

describe("EDGE_CACHE_CONTROL", () => {
  it("uses a fresh window with long stale-while-revalidate", () => {
    // The origin has a 10 ms CPU budget; a cold render is what returns 1102.
    // The TTL must be long enough that cached pages do not keep going cold, and
    // the SWR window long enough that the CDN keeps serving after it lapses.
    expect(EDGE_CACHE_CONTROL).toContain("s-maxage=600");
    expect(EDGE_CACHE_CONTROL).toContain("stale-while-revalidate=86400");
    expect(EDGE_CACHE_CONTROL).toContain("stale-if-error=604800");
    expect(EDGE_CACHE_CONTROL).toContain("public");
  });
});

/**
 * Purging is how an admin edit becomes visible immediately instead of at the
 * TTL. If the purge key ever drifts from the store key, edits silently lag —
 * the exact bug this closes — so the two are asserted equal.
 */
describe("cache keys", () => {
  it("uses the same key to store and to purge", async () => {
    const deleted: string[] = [];
    const cache = {
      delete: async (request: Request) => {
        deleted.push(request.url);
        return true;
      },
    };

    await purgePublicCache(cache);

    // The purge set must contain exactly the keys the worker stores under.
    expect(cacheKeysFor("/menu")).toEqual([
      toCacheUrl("/en/menu"),
      toCacheUrl("/ar/menu"),
    ]);
    expect(deleted).toContain(toCacheUrl("/ar/menu"));
    expect(deleted).toContain(toCacheUrl("/en/menu"));
  });

  it("purges every public page in both locales", async () => {
    const deleted: string[] = [];
    await purgePublicCache({ delete: async (r: Request) => (deleted.push(r.url), true) });
    expect(new Set(deleted).size).toBe(deleted.length); // no duplicates
    expect(deleted.length).toBeGreaterThan(8);
    expect(deleted.some((u) => u.endsWith("/ar/menu"))).toBe(true);
    expect(deleted.some((u) => u.endsWith("/en"))).toBe(true);
  });
});

describe("shouldPurgeAfter", () => {
  it("purges after an admin mutation of any method", () => {
    expect(shouldPurgeAfter({ method: "POST", pathname: "/admin/menu" })).toBe(true);
    expect(shouldPurgeAfter({ method: "PUT", pathname: "/admin/settings" })).toBe(true);
  });

  it("does not purge on reads, customer traffic or public GETs", () => {
    expect(shouldPurgeAfter({ method: "GET", pathname: "/admin/menu" })).toBe(false);
    expect(shouldPurgeAfter({ method: "POST", pathname: "/checkout" })).toBe(false);
    expect(shouldPurgeAfter({ method: "GET", pathname: "/menu" })).toBe(false);
  });
});

/**
 * The console document shell is a static, data-free SPA shell, so it is cached
 * separately from the (never-cached) admin *data* surface. These pin the
 * boundary: only a console document GET is a shell, and only it is stored.
 */
describe("isAdminShellPath", () => {
  it("matches the console document routes", () => {
    expect(isAdminShellPath("/admin")).toBe(true);
    expect(isAdminShellPath("/admin/orders")).toBe(true);
    expect(isAdminShellPath("/admin/orders/123")).toBe(true);
  });

  it("does not match the admin JSON API or other surfaces", () => {
    expect(isAdminShellPath("/api/admin/session")).toBe(false);
    expect(isAdminShellPath("/adminn")).toBe(false);
    expect(isAdminShellPath("/en/menu")).toBe(false);
    expect(isAdminShellPath("/")).toBe(false);
  });
});

describe("isAdminShellRequest", () => {
  const shell = { method: "GET", pathname: "/admin/orders", cookieNames: [] };

  it("caches a console document GET, even with the gate cookie", () => {
    expect(isAdminShellRequest(shell)).toBe(true);
    expect(isAdminShellRequest({ ...shell, cookieNames: ["panda-wok.admin"] })).toBe(true);
  });

  it("does not cache the admin data API", () => {
    expect(isAdminShellRequest({ ...shell, pathname: "/api/admin/session" })).toBe(false);
    expect(isAdminShellRequest({ ...shell, pathname: "/api/admin/orders" })).toBe(false);
  });

  it("does not cache a non-document or per-navigation variant", () => {
    expect(isAdminShellRequest({ ...shell, method: "POST" })).toBe(false);
    expect(isAdminShellRequest({ ...shell, method: "HEAD" })).toBe(false);
    expect(isAdminShellRequest({ ...shell, hasRscHeader: true })).toBe(false);
    expect(isAdminShellRequest({ ...shell, hasPrefetchHeader: true })).toBe(false);
    expect(isAdminShellRequest({ ...shell, hasAuthorization: true })).toBe(false);
  });
});

describe("adminShellCacheUrl", () => {
  it("keys by build id so a deploy invalidates the shell", () => {
    expect(adminShellCacheUrl("/admin", "buildA")).not.toBe(adminShellCacheUrl("/admin", "buildB"));
  });

  it("keeps a distinct key per route", () => {
    expect(adminShellCacheUrl("/admin", "b")).not.toBe(adminShellCacheUrl("/admin/orders", "b"));
  });
});

describe("ADMIN_SHELL_CACHE_CONTROL", () => {
  it("is edge-cached with a bounded fresh window and no browser caching", () => {
    expect(ADMIN_SHELL_CACHE_CONTROL).toContain("s-maxage=300");
    expect(ADMIN_SHELL_CACHE_CONTROL).toContain("max-age=0");
  });
});
