"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/format";
import type { FormActionResult } from "@/lib/actions/result";

/**
 * The admin mutation lifecycle in one place: submit, surface field errors,
 * surface a summary error, then refresh the server component. Every admin form
 * goes through this so the error handling is identical everywhere.
 */
export function useAdminForm<T>(
  action: (formData: FormData) => Promise<FormActionResult<T>>,
  options?: {
    onSuccess?: (data: T) => void;
    successMessage?: string;
    resetOnSuccess?: boolean;
  },
) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setPending(true);
    setError(null);
    setFields({});
    setDone(null);

    let result: FormActionResult<T>;
    try {
      result = await action(formData);
    } catch {
      // A thrown action means a transport or server fault, not a validation one.
      setError("The server did not respond. Check your connection and try again.");
      setPending(false);
      return;
    }

    if (!result.ok) {
      setError(result.error.message);
      if ("fields" in result && result.fields) setFields(result.fields);
      setPending(false);
      return;
    }

    if (options?.resetOnSuccess) form.reset();
    setDone(options?.successMessage ?? "Saved.");
    setPending(false);
    options?.onSuccess?.(result.data);
    router.refresh();
  }

  return { submit, pending, error, fields, done };
}

export function AdminForm({
  action,
  children,
  submitLabel = "Save",
  options,
  className,
  extraActions,
}: {
  action: (formData: FormData) => Promise<FormActionResult<unknown>>;
  children: React.ReactNode;
  submitLabel?: string;
  options?: Parameters<typeof useAdminForm>[1];
  className?: string;
  extraActions?: React.ReactNode;
}) {
  const { submit, pending, error, done } = useAdminForm(action, options);

  return (
    <form onSubmit={submit} className={cn("space-y-4", className)} noValidate>
      {children}

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3 text-sm text-chili-600"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {done ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-jade-500/30 bg-jade-500/10 p-3 text-sm text-jade-600"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          {done}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        {extraActions}
      </div>
    </form>
  );
}

export function Field({
  name,
  label,
  hint,
  error,
  children,
  className,
  type = "text",
  defaultValue,
  placeholder,
  dir,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  children?: React.ReactNode;
  className?: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-ink-700/65">{hint}</p> : null}
      <div className="mt-1.5">
        {children ?? (
          <input
            id={name}
            name={name}
            type={type}
            dir={dir}
            defaultValue={defaultValue}
            placeholder={placeholder}
            className="h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          />
        )}
      </div>
      {error ? <p className="mt-1 text-xs text-chili-600">{error}</p> : null}
    </div>
  );
}

export function Toggle({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-900/12 bg-rice-50 p-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-plum-600"
      />
      <span>
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-700/65">{hint}</span> : null}
      </span>
    </label>
  );
}

export function TextArea({
  name,
  label,
  hint,
  error,
  rows = 3,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  rows?: number;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-ink-700/65">{hint}</p> : null}
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2 text-sm outline-none focus:border-miso-500"
      />
      {error ? <p className="mt-1 text-xs text-chili-600">{error}</p> : null}
    </div>
  );
}

/**
 * Single-button mutation (toggle, delete, duplicate). Uses the same result
 * contract as a full form so failures are shown, never swallowed.
 */
export function AdminButtonAction({
  action,
  children,
  variant = "outline",
  confirm,
  className,
  size = "sm",
  payload,
}: {
  action: () => Promise<FormActionResult<unknown>>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  confirm?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  payload?: unknown;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function run() {
    if (confirm && !confirming) {
      setConfirming(true);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error.message);
        setPending(false);
        return;
      }
      setConfirming(false);
      setPending(false);
      router.refresh();
    } catch {
      setError("The server did not respond. Try again.");
      setPending(false);
    }
  }

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variant={confirming ? "danger" : variant}
        size={size}
        loading={pending}
        onClick={run}
        data-payload={payload === undefined ? undefined : ""}
      >
        {confirming ? "Confirm?" : children}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-chili-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
