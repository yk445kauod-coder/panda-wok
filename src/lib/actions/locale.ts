"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";
import { actionOk, type ActionResult } from "@/lib/actions/result";

/**
 * Sets the display language. The cookie takes effect immediately for every
 * visitor, and when someone is signed in the choice is mirrored onto their
 * profile so it follows them to another device.
 */
export async function setLocaleAction(
  locale: Locale,
): Promise<ActionResult<{ locale: Locale }>> {
  if (!isLocale(locale)) return actionOk({ locale: "en" });

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  const session = await getSession();
  if (session) {
    // Mirrored onto the profile so the choice follows the customer to another
    // device. A failure here must not break the switch: the cookie is already
    // set and is what actually drives the render.
    try {
      const supabase = await createServerSupabase();
      await supabase.from("profiles").update({ locale }).eq("id", session.user.id);
    } catch {
      // Non-fatal: the cookie is authoritative for this browser.
    }
  }

  // Clears the server cache for the whole tree. `revalidatePath` only accepts
  // "/" with the "layout" scope; any other argument throws and would surface as
  // a failed switch, so the call is guarded.
  try {
    revalidatePath("/", "layout");
  } catch {
    // The client calls router.refresh() after this action regardless.
  }
  return actionOk({ locale });
}
