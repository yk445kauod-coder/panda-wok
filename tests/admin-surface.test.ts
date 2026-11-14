import { describe, expect, it } from "vitest";

import { isAdminSurface } from "@/lib/auth/admin-surface";

/**
 * The console reads its data from `/api/admin/*`, and that request is what
 * carries the `x-pw-path` header letting the server client elevate to the
 * service role. If the API half is not recognised the console still renders —
 * it just reads zero rows, because the staff RLS policies resolve through
 * `auth.uid()` and a gate cookie has no session. That regression shipped once
 * (every board empty, the new-order siren silent), so the boundary is pinned.
 */
describe("isAdminSurface", () => {
  it("covers the console documents", () => {
    expect(isAdminSurface("/admin")).toBe(true);
    expect(isAdminSurface("/admin/orders")).toBe(true);
    expect(isAdminSurface("/admin/crm/segments")).toBe(true);
  });

  it("covers the console JSON API", () => {
    expect(isAdminSurface("/api/admin")).toBe(true);
    expect(isAdminSurface("/api/admin/orders")).toBe(true);
    expect(isAdminSurface("/api/admin/session")).toBe(true);
    expect(isAdminSurface("/api/admin/crm/activity")).toBe(true);
  });

  it("does not leak elevation to the customer site or public API", () => {
    expect(isAdminSurface("/")).toBe(false);
    expect(isAdminSurface("/menu")).toBe(false);
    expect(isAdminSurface("/api/analytics")).toBe(false);
    expect(isAdminSurface("/api/translate")).toBe(false);
  });

  it("does not match lookalike prefixes", () => {
    expect(isAdminSurface("/administrator")).toBe(false);
    expect(isAdminSurface("/api/administrators")).toBe(false);
    expect(isAdminSurface("/adminx/orders")).toBe(false);
  });
});
