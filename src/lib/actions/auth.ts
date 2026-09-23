"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/schemas";
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

  // Phone-first accounts sign in with their phone number (the email field was
  // optional at signup). Map a phone identifier to the deterministic placeholder
  // email used at signup before attempting authentication.
  const looksLikePhone = /^[+]?[\d\s()-]{8,}$/.test(parsed.data.email);
  const email =
    looksLikePhone
      ? `panda-${parsed.data.email.replace(/\D/g, "").slice(-10)}@phone.pandawok.app`
      : parsed.data.email;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "That email or password combination did not work.",
      },
      fields: { password: "Check your email or password" },
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
    marketingOptIn: formData.get("marketingOptIn") === "on",
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) return toFormError(parsed.error);

  // Phone-first accounts are the product default: an email is only ever used
  // when the customer provides one. When absent we derive a deterministic,
  // per-phone placeholder so Supabase Auth (which validates email formatually,
  // can still hold the account. Real password resets for phone-first accounts go
  // through the phone path (see requestPasswordResetAction).
  const email =
    parsed.data.email ??
    `panda-${parsed.data.phone.replace(/\D/g, "").slice(-10)}@phone.pandawok.app`;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        phone: parsed.data.phone,
      },
    },
  });

  if (error) {
    const alreadyExists = /already registered|already exists/i.test(error.message);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: alreadyExists
          ? "An account with that email already exists. Try signing in."
          : "We could not create your account. Please try again.",
      },
      fields: alreadyExists
        ? { email: "This email is already registered" }
        : undefined,
    };
  }

  // The profile row is created by a database trigger; apply the opt-in here.
  if (data.user && parsed.data.marketingOptIn) {
    await supabase
      .from("profiles")
      .update({ marketing_opt_in: true })
      .eq("id", data.user.id);
  }

  if (data.user) {
    // Phone-first accounts carry a system placeholder email (no real inbox),
    // so email confirmation can never complete. Auto-confirm the identity the
    // moment the account is created — the phone number is the real identifier.
    if (!parsed.data.email) {
      const admin = await import("@/lib/supabase/server").then((m) => m.tryCreateAdminSupabase());
      if (admin) {
        await admin.auth.admin.updateUserById(data.user.id, { email_confirm: true });
      }
    }

    await logActivity(supabase, {
      userId: data.user.id,
      event: "SIGNUP",
      entity: "profiles",
      entityId: data.user.id,
    });
  }

  return actionOk({ requiresConfirmation: !data.session && Boolean(parsed.data.email) });
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
  const email = String(formData.get("email") ?? "").trim();
  const looksLikePhone = /^[+]?[\d\s()-]{8,}$/.test(email);

  // Phone-first accounts cannot receive email resets (no real inbox exists
  // for the placeholder email). Route them to a human reset insteadso the
  // endpoint never leaks which identifiers exist.

  if (looksLikePhone) {
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
  const parsed = signInSchema.pick({ email: true }).safeParse({ email });

  if (!parsed.success) {
    return toFormError(parsed.error);
  }

  const supabase = await createServerSupabase();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
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
