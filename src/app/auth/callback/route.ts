import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils/redirect";

/**
 * Exchanges the email-confirmation code for a session, then sends the customer
 * on to the page they were heading for. Failures land on sign-in with a clear
 * reason instead of a raw Supabase error.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/account";
  const destination = safeNext(next, "/account");

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=missing_code", url.origin),
    );
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=link_expired", url.origin),
    );
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
