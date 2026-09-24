"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/schemas";
import { isPlaceholderEmail, looksLikePhone, placeholderEmailFor, pickSignInEmail } from "@/lib/auth/phone";
import { phoneLookupCandidates } from "@/lib/utils/phone";
import { siteUrl } from "@/lib/seo/metadata";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import {
  actionError,
  actionOk,
  toFormError,
  type FormActionResult,
} from "@/lib/actions/result";
import { appError, classifyAuthProviderError, duplicateKeyColumn, isDuplicateKeyError } from "@/lib/utils/errors";
import { logActivity } from "@/lib/activity/log";
import {
  dbCodeOf,
  logAuthEvent,
  newRequestId,
  providerCodeOf,
} from "@/lib/auth/log";
import { safeNext } from "@/lib/utils/redirect";

export async function signInAction(
  formData: FormData,
): Promise<FormActionResult<{ next: string }>> {
  const requestId = newRequestId();
  const started = Date.now();

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();

  // Phone-first accounts sign in with their phone number; the email field is
  // optional at signup. Resolve whichever identifier was typed to the address
  // Supabase Auth actually holds for the account — an account created with a
  // real email must be looked up by that email, not the phone placeholder.
  const email = await resolveSignInEmail(parsed.data.email);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    const providerCode = providerCodeOf(error);
    // The internal reason is logged with a correlation id; the user only ever
    // sees the neutral "combination did not work" copy, so this cannot be used
    // to enumerate which accounts exist.
    let code: Parameters<typeof appError>[0] = "INVALID_CREDENTIALS";
    if (/not confirmed|email_not_confirmed/i.test(`${providerCode} ${error?.message ?? ""}`)) {
      code = "EMAIL_CONFIRMATION_REQUIRED";
    } else if (/rate limit|too many/i.test(`${providerCode} ${error?.message ?? ""}`)) {
      code = "RATE_LIMITED";
    }

    logAuthEvent({
      requestId,
      action: "signin",
      outcome: "error",
      code,
      providerCode,
      identifier: parsed.data.email,
      durationMs: Date.now() - started,
    });

    return {
      ok: false,
      error: appError(code, { requestId }),
      fields:
        code === "INVALID_CREDENTIALS"
          ? { password: "Check your email, phone number or password" }
          : undefined,
    };
  }

  await logActivity(supabase, { userId: data.user.id, event: "LOGIN" });
  revalidatePath("/", "layout");

  logAuthEvent({
    requestId,
    action: "signin",
    outcome: "ok",
    identifier: parsed.data.email,
    durationMs: Date.now() - started,
  });

  return actionOk({ next: safeNext(parsed.data.next, "/menu") });
}

/**
 * Finds an existing profile that already owns the given phone or email, so
 * signup can return a specific conflict instead of letting Supabase's trigger
 * abort the whole auth-user insert with an opaque database error. Phone is
 * checked across every stored shape because rows written before canonical
 * E.164 normalisation still hold the national form.
 */
async function findExistingIdentity(params: {
  email?: string;
  phone: string;
}): Promise<"phone" | "email" | null> {
  const admin = tryCreateAdminSupabase();

  const readByPhone = async (client: NonNullable<typeof admin>) => {
    const { data, error } = await client
      .from("profiles")
      .select("id")
      .in("phone", phoneLookupCandidates(params.phone))
      .limit(1);
    if (error) return null;
    return data && data.length > 0 ? ("phone" as const) : null;
  };

  const readByEmail = async (client: NonNullable<typeof admin>) => {
    if (!params.email) return null;
    const { data, error } = await client
      .from("profiles")
      .select("id")
      .eq("email", params.email)
      .limit(1);
    if (error) return null;
    return data && data.length > 0 ? ("email" as const) : null;
  };

  if (admin) {
    return (await readByPhone(admin)) ?? (await readByEmail(admin));
  }

  // Without a service-role key we cannot read past RLS reliably; fall back to
  // the request client, which can still see a row when the caller is anonymous
  // and the policy permits it. Worst case the provider's duplicate error below
  // is classified instead.
  try {
    const supabase = await createServerSupabase();
    const byPhone = await supabase
      .from("profiles")
      .select("id")
      .in("phone", phoneLookupCandidates(params.phone))
      .limit(1);
    if (!byPhone.error && byPhone.data && byPhone.data.length > 0) return "phone";
    if (params.email) {
      const byEmail = await supabase
        .from("profiles")
        .select("id")
        .eq("email", params.email)
        .limit(1);
      if (!byEmail.error && byEmail.data && byEmail.data.length > 0) return "email";
    }
  } catch {
    // Ignore: classification below is the safety net.
  }
  return null;
}

/**
 * Resolves whatever the customer typed into the sign-in field to the address
 * Supabase Auth actually holds for that account.
 *
 * A phone number is the product's primary identifier, but it is not the
 * account's auth identity: signup derives a placeholder address only when the
 * customer gives no real email. An account created *with* an email therefore
 * lives in Auth under `madrasty61@gmail.com`, and signing in with the phone
 * would fail if we blindly recomputed the placeholder. That regression is
 * exactly what stranded returning customers, so the stored address wins and
 * the derived placeholder is only the fallback for a genuinely phone-first
 * account.
 */
async function resolveSignInEmail(identifier: string): Promise<string> {
  if (!looksLikePhone(identifier)) return identifier.trim();

  const admin = tryCreateAdminSupabase();
  if (admin) {
    const { data } = await admin
      .from("profiles")
      .select("email")
      .in("phone", phoneLookupCandidates(identifier))
      .limit(1);
    return pickSignInEmail(identifier, data?.[0]?.email ?? null);
  }

  return pickSignInEmail(identifier, null);
}

export async function signUpAction(
  formData: FormData,
): Promise<FormActionResult<{ requiresConfirmation: boolean }>> {
  const requestId = newRequestId();
  const started = Date.now();

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

  // Pre-flight: refuse an identity that already exists before touching the
  // auth provider. This is the fix for the opaque failure a returning customer
  // saw: re-signing up with a phone that is already on file made the
  // handle_new_user trigger violate profiles_phone_key, aborting the whole
  // auth-user insert with a 500 that the UI could only render as UNKNOWN.
  const existing = await findExistingIdentity({
    email: parsed.data.email,
    phone: parsed.data.phone,
  });
  if (existing === "phone") {
    logAuthEvent({
      requestId,
      action: "signup",
      outcome: "error",
      code: "PHONE_ALREADY_EXISTS",
      identifier: parsed.data.phone,
      phoneFirst,
      durationMs: Date.now() - started,
    });
    return {
      ok: false,
      error: appError("PHONE_ALREADY_EXISTS", { requestId }),
      fields: { phone: "This phone number is already registered" },
    };
  }
  if (existing === "email") {
    logAuthEvent({
      requestId,
      action: "signup",
      outcome: "error",
      code: "EMAIL_ALREADY_EXISTS",
      identifier: parsed.data.email,
      phoneFirst,
      durationMs: Date.now() - started,
    });
    return {
      ok: false,
      error: appError("EMAIL_ALREADY_EXISTS", { requestId }),
      fields: { email: "This email is already registered" },
    };
  }

  const supabase = await createServerSupabase();
  const userMetadata = {
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    // The handle_new_user trigger reads this and stores it on the profile, so
    // the language chosen at signup is the one the account starts with.
    locale: parsed.data.locale,
  };

  // The project has no custom SMTP and its built-in mailer is limited to a
  // couple of messages per hour, so an emailed confirmation link is not a
  // dependable thing to depend on: it would strand every customer who happens
  // to supply an email, and a handful of signups would exhaust the project-wide
  // quota and fail for everyone. The account is therefore created confirmed
  // server-side (email_confirm) and the customer is signed in directly. The
  // email is still stored and used as the recovery contact, not as a gate.
  const admin = tryCreateAdminSupabase();
  let userId: string | undefined;
  let hadSession = false;
  let error: { message: string; code?: string; status?: number } | null = null;

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
      const signedIn = await supabase.auth.signInWithPassword({
        email,
        password: parsed.data.password,
      });
      hadSession = !signedIn.error;
    }
  } else if (phoneFirst) {
    // Phone-first accounts have no public fallback: the derived placeholder
    // address must never be mailed, and there is no inbox to confirm from.
    logAuthEvent({
      requestId,
      action: "signup",
      outcome: "error",
      code: "DATABASE_NOT_CONFIGURED",
      phoneFirst,
      durationMs: Date.now() - started,
    });
    return {
      ok: false,
      error: appError("DATABASE_NOT_CONFIGURED", { requestId }),
    };
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

  if (error || !userId) {
    const dupColumn = duplicateKeyColumn(error);
    // Prefer the concrete identity conflict when the provider/database names
    // one; otherwise fall back to the provider classification.
    let resolved = classifyAuthProviderError(error);
    if (dupColumn === "phone") resolved = "PHONE_ALREADY_EXISTS";
    if (dupColumn === "email") resolved = "EMAIL_ALREADY_EXISTS";
    // A bare unique violation carries no column. For a phone-first account the
    // only real identity is the phone (the email is derived), so report the
    // phone rather than blaming an address the customer never entered.
    if (phoneFirst && dupColumn === null && isDuplicateKeyError(error)) {
      resolved = "PHONE_ALREADY_EXISTS";
    }

    logAuthEvent({
      requestId,
      action: "signup",
      outcome: "error",
      code: resolved,
      providerCode: providerCodeOf(error),
      dbCode: dbCodeOf(error),
      identifier: phoneFirst ? parsed.data.phone : parsed.data.email,
      phoneFirst,
      durationMs: Date.now() - started,
    });

    return {
      ok: false,
      error: appError(resolved, { requestId }),
      fields:
        resolved === "PHONE_ALREADY_EXISTS"
          ? { phone: "This phone number is already registered" }
          : resolved === "EMAIL_ALREADY_EXISTS"
            ? { email: "This email is already registered" }
            : undefined,
    };
  }

  // The profile row is created by a database trigger, but a trigger is not a
  // guarantee: a hardening migration once left the tenant column without a
  // default, so auth users were created with no profile and the account was
  // unusable. Read it back and repair (or roll back) rather than returning a
  // false success. Verification needs either the service-role client or the
  // session a confirmed email signup just established — without one, RLS hides
  // the caller's own row and a pending-confirmation account would be misjudged.
  const profileClient = admin ?? supabase;
  const canVerifyProfile = Boolean(admin) || hadSession;

  if (canVerifyProfile) {
    const { data: profileRow, error: profileReadError } = await profileClient
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (profileReadError || !profileRow) {
      let repaired = false;
      if (admin) {
        const { error: repairError } = await admin.from("profiles").insert({
          id: userId,
          full_name: parsed.data.fullName,
          phone: parsed.data.phone,
          email,
          locale: parsed.data.locale,
          marketing_opt_in: parsed.data.marketingOptIn,
        });
        repaired = !repairError;
      }

      if (!repaired) {
        // No partial unusable account: remove the auth user we just made so a
        // retry is not blocked by a phantom duplicate.
        if (admin) {
          try {
            await admin.auth.admin.deleteUser(userId);
          } catch {
            // Best effort: the account is unusable either way, and the
            // operator sees the PROFILE_CREATE_FAILED log line.
          }
        }
        logAuthEvent({
          requestId,
          action: "signup",
          outcome: "error",
          code: "PROFILE_CREATE_FAILED",
          dbCode: dbCodeOf(profileReadError),
          identifier: phoneFirst ? parsed.data.phone : parsed.data.email,
          phoneFirst,
          durationMs: Date.now() - started,
        });
        return {
          ok: false,
          error: appError("PROFILE_CREATE_FAILED", { requestId }),
        };
      }
    }
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

  if (parsed.data.marketingOptIn) {
    await profileClient
      .from("profiles")
      .update({ marketing_opt_in: true })
      .eq("id", userId);
  }

  await logActivity(supabase, {
    userId,
    event: "SIGNUP",
    entity: "profiles",
    entityId: userId,
  });

  // A phone-first account is confirmed and (normally) signed in already. When
  // the session could not be minted despite a confirmed user, the account is
  // still valid; tell the customer to sign in rather than report a hard error.
  logAuthEvent({
    requestId,
    action: "signup",
    outcome: "ok",
    code: hadSession ? "OK" : "EMAIL_CONFIRMATION_REQUIRED",
    identifier: phoneFirst ? parsed.data.phone : parsed.data.email,
    phoneFirst,
    durationMs: Date.now() - started,
  });

  // An email signup only needs confirmation when the project actually sends a
  // confirmation mail (no session was issued). Phone-first is already done.
  return actionOk({
    requiresConfirmation: !hadSession && !phoneFirst && Boolean(parsed.data.email),
  });
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
