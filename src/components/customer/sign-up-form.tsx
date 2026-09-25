"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErrorText, useI18n, useT } from "@/components/i18n-provider";
import { signUpAction } from "@/lib/actions/auth";
import { toAppError, type AppError } from "@/lib/utils/errors";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils/format";

/**
 * Registration. Phone is required because the rider needs to reach the
 * customer, and the copy explains why rather than demanding it silently. The
 * language chosen here is stored on the account (via the signup trigger) and on
 * this device (via cookie), so the whole app continues in that language.
 */
export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const t = useT();
  const errorText = useErrorText();
  const { locale, dir } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    locale,
  });

  function update(key: "fullName" | "email" | "phone" | "password") {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set("fullName", form.fullName);
      formData.set("phone", form.phone);
      formData.set("email", form.email);
      formData.set("password", form.password);
      formData.set("locale", form.locale);
      formData.set("next", next);

      const result = await signUpAction(formData);

      if (!result.ok) {
        setError(result.error);
        if ("fields" in result && result.fields) setFields(result.fields);
        setPending(false);
        return;
      }

      if (result.data.requiresConfirmation) {
        setNotice(t("auth.signUp.successBody"));
        setPending(false);
        return;
      }

      router.replace("/account");
      router.refresh();
    } catch (caught) {
      setError(toAppError(caught));
      setPending(false);
    }
  }

  if (notice) {
    return (
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">
          {t("auth.signUp.successTitle")}
        </h1>
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl border border-jade-500/30 bg-jade-500/10 p-3.5 text-sm text-ink-800"
        >
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-jade-600"
            aria-hidden="true"
          />
          {notice}
        </p>
        <Link
          href="/auth/sign-in"
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-indigo-600 text-sm font-medium text-rice-50 hover:bg-indigo-700"
        >
          {t("auth.forgot.backToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="font-display text-xl font-semibold text-ink-900">
        {t("auth.signUp.title")}
      </h1>
      <p className="mt-1 text-sm text-ink-700/80">{t("auth.signUp.subtitle")}</p>

      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3 text-sm text-chili-600"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {errorText(error)}
            {error.requestId ? (
              <span className="mt-1 block text-xs text-chili-600/80">
                {t("errors.reference", { digest: error.requestId })}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <Field
          id="fullName"
          label={t("auth.signUp.fullName")}
          placeholder={t("auth.signUp.fullNamePlaceholder")}
          value={form.fullName}
          onChange={update("fullName")}
          autoComplete="name"
          error={fields.fullName}
          required
        />
        <Field
          id="phone"
          label={t("auth.signUp.phone")}
          hint={t("auth.signUp.phoneHint")}
          placeholder={t("auth.signUp.phonePlaceholder")}
          value={form.phone}
          onChange={update("phone")}
          autoComplete="tel"
          inputMode="tel"
          error={fields.phone}
          required
        />
        <Field
          id="email"
          label={t("auth.signUp.emailOptional")}
          hint={t("auth.signUp.emailHint")}
          placeholder={t("auth.signUp.emailPlaceholder")}
          type="email"
          value={form.email}
          onChange={update("email")}
          autoComplete="email"
          error={fields.email}
        />
        <Field
          id="password"
          label={t("auth.signUp.password")}
          hint={t("auth.signUp.passwordHint")}
          type="password"
          value={form.password}
          onChange={update("password")}
          autoComplete="new-password"
          error={fields.password}
          required
        />

        {/* Language choice. A visible picker rather than a silent default, so
            an Arabic-first customer never lands on an English page first. */}
        <fieldset>
          <legend className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
            <Languages className="size-3.5 text-ink-700/60" aria-hidden="true" />
            {t("auth.signUp.language")}
          </legend>
          <p className="mt-0.5 text-xs text-ink-700/65">
            {t("auth.signUp.languageHint")}
          </p>
          <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-2">
            {LOCALES.map((option) => {
              const active = form.locale === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() =>
                    setForm((current) => ({ ...current, locale: option as Locale }))
                  }
                  className={cn(
                    "rounded-xl border p-3 text-start text-sm font-medium transition-colors",
                    active
                      ? "border-indigo-600 bg-indigo-600/8 text-ink-900"
                      : "border-ink-900/12 text-ink-800 hover:bg-rice-200/60",
                  )}
                >
                  <span dir={option === "ar" ? "rtl" : dir}>
                    {LOCALE_LABELS[option]}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <Button type="submit" size="lg" className="mt-5 w-full" loading={pending}>
        {pending ? t("auth.signUp.submitting") : t("auth.signUp.submit")}
      </Button>

      <p className="mt-4 text-center text-xs text-ink-700/70">
        {t("auth.signUp.haveAccount")}{" "}
        <Link
          href={`/auth/sign-in${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          {t("auth.signUp.signIn")}
        </Link>
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  type = "text",
  required,
  autoComplete,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "tel" | "text" | "email";
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-ink-700/65">{hint}</p> : null}
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={
          error
            ? "mt-1.5 h-11 w-full rounded-xl border border-chili-500/50 bg-rice-50 px-3 text-sm outline-none focus:border-chili-500"
            : "mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        }
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-chili-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
