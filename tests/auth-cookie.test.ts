import { describe, expect, it } from "vitest";

import { hasAuthCookie } from "@/lib/supabase/middleware";

/**
 * The public site is read by far more anonymous visitors than signed-in ones.
 * `updateSession` skips the Supabase round trip unless an auth cookie is
 * present, which is what keeps a rush of menu browsing from spending one
 * subrequest per hit. Getting this wrong in the other direction (skipping a
 * real session) would render pages as logged-out, so the boundary is pinned.
 */
describe("hasAuthCookie", () => {
  it("is false for a request with no cookies", () => {
    expect(hasAuthCookie([])).toBe(false);
  });

  it("is false for unrelated cookies", () => {
    expect(hasAuthCookie(["panda-wok.locale", "panda-wok.admin", "theme"])).toBe(false);
  });

  it("is false for a theme cookie that merely looks similar", () => {
    expect(hasAuthCookie(["sb-like", "auth-token-x"])).toBe(false);
  });

  it("recognises Supabase's chunked session cookies", () => {
    expect(hasAuthCookie(["sb-xjbtsryidznsxqlynmfa-auth-token.0"])).toBe(true);
    expect(hasAuthCookie(["sb-xjbtsryidznsxqlynmfa-auth-token.1"])).toBe(true);
    expect(hasAuthCookie(["other", "sb-abc-auth-token"])).toBe(true);
  });
});
