import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/config/env";

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
  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) {
    return { response, userId: null };
  }

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
