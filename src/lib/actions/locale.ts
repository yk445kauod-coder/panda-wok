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
    const supabase = await createServerSupabase();
    await supabase
      .from("profiles")
      .update({ locale })
      .eq("id", session.user.id);
  }

  revalidatePath("/", "layout");
  return actionOk({ locale });
}
