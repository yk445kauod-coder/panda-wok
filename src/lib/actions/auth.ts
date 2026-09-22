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
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "That email and password combination did not work.",
      },
      fields: { password: "Check your email and password" },
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

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
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
    await logActivity(supabase, {
      userId: data.user.id,
      event: "SIGNUP",
      entity: "profiles",
      entityId: data.user.id,
    });
  }

  return actionOk({ requiresConfirmation: !data.session });
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
): Promise<FormActionResult<undefined>> {
  const email = String(formData.get("email") ?? "").trim();
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
  return actionOk();
}
