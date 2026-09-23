"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/schemas";
import { emailForIdentifier, isPlaceholderEmail, looksLikePhone, placeholderEmailFor } from "@/lib/auth/phone";
import { siteUrl } from "@/lib/seo/metadata";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import {
  actionError,
  actionOk,
  toFormError,
  type FormActionResult,
} from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";
import { safeNext } from "@/lib/utils/redirect";

export async function signInAction(
  formData: FormData,
): Promise<FormActionResult<{ next: string }>> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  // Phone-first accounts sign in with their phone number; the email field is
  // optional at signup. Resolve whichever identifier was typed to the address
  // Supabase Auth actually holds for the account.
  const email = emailForIdentifier(parsed.data.email);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "That email, phone number or password combination did not work.",
      },
      fields: { password: "Check your email, phone number or password" },
    };
  }

  await logActivity(supabase, { userId: data.user.id, event: "LOGIN" });
  revalidatePath("/", "layout");

  return actionOk({ next: safeNext(parsed.data.next, "/menu") });
}

export async function signUpAction(
  formData: FormData,
): Promise<FormActionResult<{ requiresConfirmation: boolean }>> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
    locale: formData.get("locale") ?? undefined,
    marketingOptIn: formData.get("marketingOptIn") === "on",
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) return toFormError(parsed.error);

  // Phone-first accounts are the product default: an email is only ever used
  // when the customer provides one. When absent we derive a deterministic,
  // per-phone placeholder so Supabase Auth — which requires an email-shaped
  // identifier — can still hold the account. Real password resets for
  // phone-first accounts go through the phone path (see
  // requestPasswordResetAction).
  const email = parsed.data.email ?? placeholderEmailFor(parsed.data.phone);
  const phoneFirst = !parsed.data.email;

  const supabase = await createServerSupabase();
  const userMetadata = {
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    // The handle_new_user trigger reads this and stores it on the profile, so
    // the language chosen at signup is the one the account starts with.
    locale: parsed.data.locale,
  };

  // Phone-first accounts are created through the admin API rather than the
  // public sign-up call. `signUp` sends a confirmation email to the derived
  // placeholder address, which (a) fails deliverability validation for the
  // domain and (b) burns the project-wide email rate limit — a handful of
  // signups would lock the form for everyone. Creating the identity confirmed
  // skips the unusable email entirely; the phone number is the real
  // identifier, and the customer is signed in below.
  const admin = phoneFirst ? tryCreateAdminSupabase() : null;
  let userId: string | undefined;
  let hadSession = false;
  let error: { message: string } | null = null;

  if (admin) {
    const created = await admin.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    userId = created.data.user?.id;
    error = created.error;
    // The admin API cannot mint a session, so sign in to set the cookies.
    if (userId) {
      hadSession = !(await supabase.auth.signInWithPassword({
        email,
        password: parsed.data.password,
      })).error;
    }
  } else {
    const signedUp = await supabase.auth.signUp({
      email,
      password: parsed.data.password,
      options: { data: userMetadata },
    });
    userId = signedUp.data.user?.id;
    hadSession = Boolean(signedUp.data.session);
    error = signedUp.error;
  }

  if (error) {
    const alreadyExists = /already registered|already exists|been registered/i.test(
      error.message,
    );
    const identifier = phoneFirst ? "phone number" : "email";
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: alreadyExists
          ? `An account with that ${identifier} already exists. Try signing in.`
          : "We could not create your account. Please try again.",
      },
      fields: alreadyExists
        ? phoneFirst
          ? { phone: "This phone number is already registered" }
          : { email: "This email is already registered" }
        : undefined,
    };
  }

  // Remember the choice on this device too, so the very next page (including a
  // confirmation screen) renders in the language they picked.
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  // The profile row is created by a database trigger; apply the opt-in here.
  if (userId && parsed.data.marketingOptIn) {
    await supabase
      .from("profiles")
      .update({ marketing_opt_in: true })
      .eq("id", userId);
  }

  if (userId) {
    await logActivity(supabase, {
      userId,
      event: "SIGNUP",
      entity: "profiles",
      entityId: userId,
    });
  }

  // Only email signups have a real inbox to confirm; phone-first accounts are
  // already confirmed and signed in.
  return actionOk({ requiresConfirmation: !hadSession && !phoneFirst });
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await logActivity(supabase, { userId: data.user.id, event: "LOGOUT" });
  }
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<FormActionResult<{ channel: "email" | "phone"; message: string }>> {
  const identifier = String(formData.get("email") ?? "").trim();

  // Phone-first accounts have no real inbox, so an email reset would silently
  // vanish. Route them to a human reset instead. The response is identical in
  // shape for every identifier, so the endpoint cannot be used to discover
  // which accounts exist.
  if (looksLikePhone(identifier)) {
    const { getPublicSettings } = await import("@/lib/services/catalog");
    const settings = await getPublicSettings().catch(() => null);
    const supportPhone = settings?.support?.phone ?? "";
    return {
      ok: true,
      data: {
        channel: "phone",
        message: supportPhone
          ? `Phone-first account recognized. Call or WhatsApp us on ${supportPhone} and we will verify your identity and reset your password.`
          : "Phone-first account recognized. Contact the kitchen and we will verify your identity and reset your password.",
      },
    };
  }

  const parsed = signInSchema.pick({ email: true }).safeParse({ email: identifier });

  if (!parsed.success) {
    return toFormError(parsed.error);
  }

  // Never send reset mail to a derived placeholder address: there is no inbox,
  // and doing so would burn the email rate limit the real customers share.
  if (isPlaceholderEmail(parsed.data.email)) {
    return {
      ok: true,
      data: {
        channel: "email",
        message: "If an account exists for that email, we sent a reset link. Check your inbox.",
      },
    };
  }

  const supabase = await createServerSupabase();
  const origin = siteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/account`,
  });

  if (error) return actionError(error);

  // Always report success so the endpoint cannot be used to enumerate accounts.
  return {
    ok: true,
    data: {
      channel: "email",
      message: "If an account exists for that email, we sent a reset link. Check your inbox.",
    },
  };
}
