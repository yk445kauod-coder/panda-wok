import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/config/public-env";
import { isD1Backend } from "@/lib/d1/backend";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/d1-session";

/**
 * True when the request carries a Supabase auth cookie. Pure so the rush-path
 * decision (network call or not) can be unit-tested without a NextRequest.
 *
 * Matches on `-auth-token` appearing anywhere after the `sb-` prefix, because a
 * session too large for one cookie is split into `...-auth-token.0`,
 * `...-auth-token.1`, ... A `endsWith` check would miss every chunked session
 * and render a signed-in customer as logged out.
 */
export function hasAuthCookie(cookieNames: readonly string[]) {
  return cookieNames.some((name) => name.startsWith("sb-") && name.includes("-auth-token"));
}

/**
 * Refreshes the Supabase session on every navigation and returns the response
 * that must be forwarded. Without this, server components can render against a
 * stale or missing token.
 *
 * The auth cookie is checked *before* touching the network. Almost all traffic
 * is anonymous (menu browsers, crawlers), and those requests carry no
 * `sb-<ref>-auth-token` cookie, so there is nothing to refresh and no reason to
 * spend a subrequest. During a rush this keeps the public pages from paying a
 * round trip per hit — on the Free plan the subrequest budget is per request,
 * so skipping it is what lets one Worker invocation stay cheap.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // The D1 backend's session is a stateless signed cookie, so there is nothing
  // to refresh: verifying it is a local HMAC check with no network call. A
  // Supabase refresh would be pointless here and the cookie names differ, so the
  // two paths cannot be confused.
  if (isD1Backend()) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const claims = await readSessionToken(token);
    return { response, userId: claims?.sub ?? null };
  }

  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) {
    return { response, userId: null };
  }

  // Imported lazily. Measured honestly: Turbopack still inlines `@supabase/ssr`
  // and auth-js into the middleware bundle, so this does NOT shrink it — the
  // handler is ~862 KB either way. What it does buy is that the module's own
  // initialisation is not required on a D1 deployment, where this branch is
  // unreachable and the client is never constructed. The import stays static-
  // free so a bundler that *can* split it (a non-Turbopack build) will.
  const { createServerClient } = await import("@supabase/ssr");

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() validates the JWT; getUser() would add a round trip per request.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  return { response, userId };
}
