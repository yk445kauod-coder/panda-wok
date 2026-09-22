"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateProfileAction } from "@/lib/actions/account";

/** Profile editor. Field errors come back keyed by name from the Zod schema. */
export function ProfileForm({
  defaults,
}: {
  defaults: {
    fullName: string;
    phone: string;
    marketingOptIn: boolean;
    notificationsOptIn: boolean;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(defaults);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setError(null);
    setFields({});

    const formData = new FormData();
    formData.set("fullName", form.fullName);
    formData.set("phone", form.phone);
    if (form.marketingOptIn) formData.set("marketingOptIn", "on");
    if (form.notificationsOptIn) formData.set("notificationsOptIn", "on");

    const result = await updateProfileAction(formData);

    if (!result.ok) {
      setError(result.error.message);
      if ("fields" in result && result.fields) setFields(result.fields);
      setPending(false);
      return;
    }

    setSaved(true);
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3" noValidate>
      <div>
        <label htmlFor="fullName" className="block text-sm font-medium text-ink-900">
          Full name
        </label>
        <input
          id="fullName"
          value={form.fullName}
          onChange={(event) =>
            setForm((current) => ({ ...current, fullName: event.target.value }))
          }
          autoComplete="name"
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        />
        {fields.fullName ? (
          <p className="mt-1 text-xs text-chili-600">{fields.fullName}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-ink-900">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(event) =>
            setForm((current) => ({ ...current, phone: event.target.value }))
          }
          autoComplete="tel"
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        />
        {fields.phone ? (
          <p className="mt-1 text-xs text-chili-600">{fields.phone}</p>
        ) : null}
      </div>

      <fieldset className="space-y-2 pt-1">
        <legend className="text-sm font-medium text-ink-900">Messages from us</legend>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={form.notificationsOptIn}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                notificationsOptIn: event.target.checked,
              }))
            }
            className="mt-0.5 size-4 accent-plum-600"
          />
          <span className="text-sm text-ink-800">
            Order updates
            <span className="mt-0.5 block text-xs text-ink-700/65">
              Status changes and anything the kitchen needs to tell you about your order.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={form.marketingOptIn}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                marketingOptIn: event.target.checked,
              }))
            }
            className="mt-0.5 size-4 accent-plum-600"
          />
          <span className="text-sm text-ink-800">
            Offers and new dishes
            <span className="mt-0.5 block text-xs text-ink-700/65">
              Occasional announcements. You can turn this off at any time.
            </span>
          </span>
        </label>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-chili-600">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
        {saved ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-jade-600">
            <Check className="size-4" aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
