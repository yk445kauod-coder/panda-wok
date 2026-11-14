/**
 * Which requests belong to the ops console.
 *
 * The console is a static shell, so its data no longer arrives with the
 * document: the browser asks `/api/admin/*` for it. Both halves have to be
 * recognised here, because this predicate decides whether the request gets the
 * `x-pw-path` header that lets `createServerSupabase()` elevate to the service
 * role. The gate is a cookie, not a Supabase session, so without the header the
 * reads run anonymous and the staff RLS policies (`is_staff()` → `auth.uid()`)
 * match nothing — every console screen loads empty.
 *
 * Kept as a pure function, away from `next/server`, so the boundary is unit
 * tested rather than discovered in production.
 */
export function isAdminSurface(barePath: string): boolean {
  return (
    barePath === "/admin" ||
    barePath.startsWith("/admin/") ||
    barePath === "/api/admin" ||
    barePath.startsWith("/api/admin/")
  );
}
