"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErrorText, useT } from "@/components/i18n-provider";
import { requestPasswordResetAction } from "@/lib/actions/auth";
import { toAppError, type AppError } from "@/lib/utils/errors";

export function ForgotPasswordForm() {
  const t = useT();
  const errorText = useErrorText();
  const [identifier, setIdentifier] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ channel: string; message: string } | null>(
    null,
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.set("email", identifier);
      const result = await requestPasswordResetAction(formData);

      if (!result.ok) {
        setError(result.error);
        if ("fields" in result && result.fields) setFields(result.fields);
        setPending(false);
        return;
      }

      setSuccess(result.data);
      setPending(false);
    } catch (caught) {
      setError(toAppError(caught));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3 text-sm text-chili-600"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errorText(error)}
        </p>
      ) : null}

      {success ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-jade-500/30 bg-jade-500/10 p-3.5 text-sm text-ink-800"
        >
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-jade-600"
            aria-hidden="true"
          />
          {success.message}
        </p>
      ) : null}

      <div>
        <label
          htmlFor="identifier"
          className="mb-1.5 block text-sm font-medium text-ink-800"
        >
          {t("auth.forgot.identifier")}
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="email"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder={t("auth.signIn.identifierPlaceholder")}
          required
          aria-invalid={Boolean(fields.identifier)}
          className="h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3.5 text-base text-ink-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
        {fields.identifier ? (
          <p className="mt-1 text-xs text-chili-600">{fields.identifier}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
      </Button>

      <p className="text-center text-sm text-ink-700/70">
        <Link
          href="/auth/sign-in"
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          {t("auth.forgot.backToSignIn")}
        </Link>
      </p>
    </form>
  );
}
