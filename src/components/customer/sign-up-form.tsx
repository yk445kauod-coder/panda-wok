"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signUpAction } from "@/lib/actions/auth";
import { toAppError, type AppError } from "@/lib/utils/errors";

/**
 * Registration. Phone is required because the rider needs to reach the customer,
 * and the copy explains why rather than demanding it silently.
 */
export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
  });

  function update(key: keyof typeof form) {
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
      formData.set("next", next);

      const result = await signUpAction(formData);

      if (!result.ok) {
        setError(result.error);
        if ("fields" in result && result.fields) setFields(result.fields);
        setPending(false);
        return;
      }

      if (result.data.requiresConfirmation) {
        setNotice(
          "Check your inbox — we sent a link to confirm your email before you can sign in.",
        );
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
          Confirm your email
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
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-plum-600 text-sm font-medium text-rice-50 hover:bg-plum-700"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="font-display text-xl font-semibold text-ink-900">
        Create your account
      </h1>
      <p className="mt-1 text-sm text-ink-700/80">
        An account lets you order, track deliveries and earn loyalty points.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3 text-sm text-chili-600"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error.message}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <Field
          id="fullName"
          label="Full name"
          value={form.fullName}
          onChange={update("fullName")}
          autoComplete="name"
          error={fields.fullName}
          required
        />
        <Field
          id="phone"
          label="Phone number"
          hint="So the rider can reach you about your delivery."
          value={form.phone}
          onChange={update("phone")}
          autoComplete="tel"
          inputMode="tel"
          error={fields.phone}
          required
        />
        <Field
          id="email"
          label="Email"
          type="email"
          value={form.email}
          onChange={update("email")}
          autoComplete="email"
          error={fields.email}
          required
        />
        <Field
          id="password"
          label="Password"
          hint="At least 8 characters."
          type="password"
          value={form.password}
          onChange={update("password")}
          autoComplete="new-password"
          error={fields.password}
          required
        />
      </div>

      <Button type="submit" size="lg" className="mt-5 w-full" loading={pending}>
        Create account
      </Button>

      <p className="mt-4 text-center text-xs text-ink-700/70">
        Already have an account?{" "}
        <Link
          href={`/auth/sign-in${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-plum-600 hover:text-plum-700"
        >
          Sign in
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
