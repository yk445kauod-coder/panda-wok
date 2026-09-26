"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErrorText, useT } from "@/components/i18n-provider";
import { signInAction } from "@/lib/actions/auth";
import { toAppError, type AppError } from "@/lib/utils/errors";

/**
 * Sign-in form. It posts through a server action, surfaces field-level errors
 * from Zod, and never reveals whether an email exists.
 */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const t = useT();
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("email", email);
      formData.set("password", password);
      formData.set("next", next);

      const result = await signInAction(formData);
      if (!result.ok) {
        setError(result.error);
        setPending(false);
        return;
      }

      // The action validates the redirect target and hands back a safe path.
      router.replace(result.data.next);
      router.refresh();
    } catch (caught) {
      setError(toAppError(caught));
      setPending(false);
    }
  }

  const message =
    typeof error === "string"
      ? error
      : error
        ? errorText(error)
        : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="font-display text-xl font-semibold text-ink-900">
        {t("auth.signIn.title")}
      </h1>
      <p className="mt-1 text-sm text-ink-700/80">{t("auth.signIn.subtitle")}</p>

      {message ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3 text-sm text-chili-600"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {message}
            {typeof error === "object" && error?.requestId ? (
              <span className="mt-1 block text-xs text-chili-600/80">
                {t("errors.reference", { digest: error.requestId })}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-900">
            {t("auth.signIn.identifier")}
          </label>
          <input
            id="email"
            name="email"
            type="text"
            autoComplete="username"
            required
            value={email}
            placeholder={t("auth.signIn.identifierPlaceholder")}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink-900">
            {t("auth.signIn.password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="mt-5 w-full" loading={pending}>
        {pending ? t("auth.signIn.submitting") : t("auth.signIn.submit")}
      </Button>

      <div className="mt-4 flex items-center justify-between text-xs">
        <Link href="/auth/forgot-password" className="text-vermilion-600 hover:text-vermilion-700">
          {t("auth.signIn.forgot")}
        </Link>
        <Link
          href={`/auth/sign-up${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-ink-900 hover:text-vermilion-600"
        >
          {t("auth.signIn.noAccount")}
        </Link>
      </div>
    </form>
  );
}
