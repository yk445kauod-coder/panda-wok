"use client";

import { createContext, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { cn, slugify } from "@/lib/utils/format";
import type { FormActionResult } from "@/lib/actions/result";

import { useErrorText, useT } from "@/components/i18n-provider";

/**
 * Field-level messages returned by a failed action (e.g. "This slug is taken").
 * AdminForm publishes them here so every Field/TextArea below can render its
 * own message without the caller threading props through the whole tree. Before
 * this, `useAdminForm` captured `fields` but nothing ever rendered them, so a
 * duplicate-slug rejection showed only a generic summary line.
 */
const FieldErrorsContext = createContext<Record<string, string>>({});

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
  const errorText = useErrorText();
  const t = useT();
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
      setError(t("admin.common.serverNoResponse"));
      setPending(false);
      return;
    }

    if (!result.ok) {
      setError(errorText(result.error));
      if ("fields" in result && result.fields) setFields(result.fields);
      setPending(false);
      return;
    }

    if (options?.resetOnSuccess) form.reset();
    setDone(options?.successMessage ?? t("admin.common.saved"));
    setPending(false);
    options?.onSuccess?.(result.data);
    router.refresh();
  }

  return { submit, pending, error, fields, done };
}

export function AdminForm({
  action,
  children,
  submitLabel,
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
  const t = useT();
  const { submit, pending, error, done, fields } = useAdminForm(action, options);

  return (
    <FieldErrorsContext.Provider value={fields}>
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
            {submitLabel ?? t("admin.common.save")}
          </Button>
          {extraActions}
        </div>
      </form>
    </FieldErrorsContext.Provider>
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
  value,
  onChange,
  placeholder,
  dir,
  required,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  children?: React.ReactNode;
  className?: string;
  type?: string;
  defaultValue?: string;
  /** Set `value` + `onChange` to drive the field from state; omit both for an
   * uncontrolled field seeded by `defaultValue`. */
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  dir?: "ltr" | "rtl";
  required?: boolean;
}) {
  const fieldErrors = useContext(FieldErrorsContext);
  const message = error ?? fieldErrors[name];
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
            required={required}
            defaultValue={value === undefined ? defaultValue : undefined}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            aria-invalid={message ? true : undefined}
            className={cn(
              "h-11 w-full rounded-xl border bg-rice-50 px-3 text-sm outline-none focus:border-miso-500",
              message ? "border-chili-500" : "border-ink-900/12",
            )}
          />
        )}
      </div>
      {message ? <p className="mt-1 text-xs text-chili-600">{message}</p> : null}
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
        className="mt-0.5 size-4 shrink-0 accent-vermilion-600"
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
  const fieldErrors = useContext(FieldErrorsContext);
  const message = error ?? fieldErrors[name];
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
        aria-invalid={message ? true : undefined}
        className={cn(
          "mt-1.5 w-full rounded-xl border bg-rice-50 px-3 py-2 text-sm outline-none focus:border-miso-500",
          message ? "border-chili-500" : "border-ink-900/12",
        )}
      />
      {message ? <p className="mt-1 text-xs text-chili-600">{message}</p> : null}
    </div>
  );
}

/**
 * Slug input that fills itself from the English name until the admin edits it
 * by hand, then stops guessing. Drops into a form, keeps its own state, and
 * still participates in the field-error context by name.
 */
export function SlugField({
  name = "slug",
  label,
  hint,
  sourceName,
  defaultValue = "",
}: {
  name?: string;
  label?: string;
  hint?: string;
  /** Form field name to derive the slug from (e.g. the English name). */
  sourceName: string;
  defaultValue?: string;
}) {
  const t = useT();
  const fieldErrors = useContext(FieldErrorsContext);
  const message = fieldErrors[name];
  const [value, setValue] = useState(defaultValue);
  const touched = useRef(Boolean(defaultValue));

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink-900">
        {label ?? t("admin.common.slugLabel")}
      </label>
      <p className="mt-0.5 text-xs text-ink-700/65">
        {hint ?? t("admin.common.slugHint")}
      </p>
      <input
        id={name}
        name={name}
        value={value}
        required
        aria-invalid={message ? true : undefined}
        onInput={(event) => {
          touched.current = true;
          const next = (event.target as HTMLInputElement).value;
          setValue(slugify(next));
        }}
        onBlur={() => {
          // Derive only while the admin has not typed their own slug.
          if (touched.current) return;
          const source = document.querySelector<HTMLInputElement>(`[name="${sourceName}"]`);
          if (source?.value) setValue(slugify(source.value));
        }}
        className={cn(
          "mt-1.5 h-11 w-full rounded-xl border bg-rice-50 px-3 font-mono text-sm outline-none focus:border-miso-500",
          message ? "border-chili-500" : "border-ink-900/12",
        )}
      />
      {message ? <p className="mt-1 text-xs text-chili-600">{message}</p> : null}
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
  const errorText = useErrorText();
  const t = useT();
  const { confirm: ask } = useConfirm();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    // A destructive action asks first, in a real dialog rather than a button
    // that silently changes its own label. Cancelling returns without mutating.
    if (confirm) {
      const agreed = await ask({
        title: confirm,
        confirmLabel: t("admin.common.goAhead"),
        cancelLabel: t("admin.common.cancel"),
        tone: variant === "danger" ? "danger" : "warning",
      });
      if (!agreed) return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await action();
      if (!result.ok) {
        setError(errorText(result.error));
        setPending(false);
        return;
      }
      setPending(false);
      router.refresh();
    } catch {
      setError(t("admin.common.serverTryAgain"));
      setPending(false);
    }
  }

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={pending}
        onClick={run}
        data-payload={payload === undefined ? undefined : ""}
      >
        {children}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-chili-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
