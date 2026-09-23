"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { AdminForm } from "@/components/admin/form-kit";
import { toggleFeatureFlagAction, updateSettingsAction } from "@/lib/actions/admin";
import type { Json } from "@/lib/types/database";
import { cn, humanise } from "@/lib/utils/format";

import { useErrorText } from "@/components/i18n-provider";
export type FeatureFlagRow = {
  key: string;
  label: string;
  description: string | null;
  module: string;
  is_enabled: boolean;
  sort_order: number;
};

/**
 * One feature flag switch. The action takes a FormData payload rather than
 * positional arguments, so the checkbox value is assembled here exactly as the
 * server expects (`isEnabled` compared against the string "true").
 */
export function FeatureFlagToggle({ flag }: { flag: FeatureFlagRow }) {
  const router = useRouter();
  const errorText = useErrorText();
  const [enabled, setEnabled] = useState(flag.is_enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputId = `flag-${flag.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  async function apply(next: boolean) {
    setPending(true);
    setError(null);
    setEnabled(next);

    const formData = new FormData();
    formData.set("key", flag.key);
    formData.set("isEnabled", next ? "true" : "false");

    try {
      const result = await toggleFeatureFlagAction(formData);
      if (!result.ok) {
        setError(errorText(result.error));
        setEnabled(!next);
        setPending(false);
        return;
      }
      setPending(false);
      router.refresh();
    } catch {
      setError("The server did not respond. Try again.");
      setEnabled(!next);
      setPending(false);
    }
  }

  return (
    <li className="washi-panel p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-900">{flag.label}</span>
            <span className="rounded-full bg-ink-900/8 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-700">
              {flag.module}
            </span>
          </div>
          {flag.description ? (
            <p className="mt-1 text-xs text-ink-700/80">{flag.description}</p>
          ) : null}
          <p className="mt-1 font-mono text-[11px] text-ink-700/60">{flag.key}</p>
        </div>

        <label
          htmlFor={inputId}
          className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-ink-800"
        >
          <input
            id={inputId}
            type="checkbox"
            checked={enabled}
            disabled={pending}
            onChange={(event) => apply(event.target.checked)}
            className="size-4 accent-plum-600"
          />
          {pending ? "Saving…" : enabled ? "On" : "Off"}
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-chili-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export type SettingRow = {
  key: string;
  value: Json;
  description: string | null;
  is_public: boolean;
};

type Kind = "boolean" | "number" | "string" | "json";

function kindOf(value: Json): Kind {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "json";
}

function initialText(value: Json): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function coerce(kind: Kind, text: string): Json {
  if (kind === "boolean") return text === "true";
  if (kind === "number") {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (kind === "json") {
    try {
      return JSON.parse(text) as Json;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * Business settings editor. The action accepts a single JSON payload under the
 * `values` key, so each control writes into local state and one hidden input
 * carries the whole array. Types are inferred from the stored value, which
 * keeps numbers and booleans as jsonb numbers and booleans rather than strings.
 */
export function SettingsForm({ settings }: { settings: SettingRow[] }) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(settings.map((setting) => [setting.key, initialText(setting.value)])),
  );

  const groups = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    for (const setting of settings) {
      const prefix = setting.key.includes(".")
        ? setting.key.slice(0, setting.key.indexOf("."))
        : "general";
      const bucket = map.get(prefix) ?? [];
      bucket.push(setting);
      map.set(prefix, bucket);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [settings]);

  const payload = JSON.stringify(
    settings.map((setting) => ({
      key: setting.key,
      value: coerce(kindOf(setting.value), draft[setting.key] ?? initialText(setting.value)),
    })),
  );

  return (
    <AdminForm
      action={updateSettingsAction}
      submitLabel="Save settings"
      options={{ successMessage: "Settings updated." }}
    >
      <input type="hidden" name="values" value={payload} />

      {groups.map(([prefix, rows]) => (
        <fieldset key={prefix} className="washi-panel p-4">
          <legend className="px-1 font-display text-sm font-semibold text-ink-900">
            {humanise(prefix)}
          </legend>

          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {rows.map((setting) => {
              const kind = kindOf(setting.value);
              const inputId = `setting-${setting.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
              const value = draft[setting.key] ?? initialText(setting.value);

              return (
                <div key={setting.key}>
                  <label
                    htmlFor={inputId}
                    className="block text-sm font-medium text-ink-900"
                  >
                    {setting.key}
                  </label>
                  {setting.description ? (
                    <p className="mt-0.5 text-xs text-ink-700/65">
                      {setting.description}
                    </p>
                  ) : null}

                  <div className="mt-1.5">
                    {kind === "boolean" ? (
                      <label
                        htmlFor={inputId}
                        className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-ink-900/12 bg-rice-50 px-3"
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={value === "true"}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [setting.key]: event.target.checked ? "true" : "false",
                            }))
                          }
                          className="size-4 accent-plum-600"
                        />
                        <span className="text-sm text-ink-800">
                          {value === "true" ? "Enabled" : "Disabled"}
                        </span>
                      </label>
                    ) : kind === "json" ? (
                      <textarea
                        id={inputId}
                        rows={3}
                        value={value}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [setting.key]: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2 font-mono text-xs outline-none focus:border-miso-500"
                      />
                    ) : (
                      <input
                        id={inputId}
                        type={kind === "number" ? "number" : "text"}
                        inputMode={kind === "number" ? "decimal" : undefined}
                        value={value}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [setting.key]: event.target.value,
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
                      />
                    )}
                  </div>

                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-700/60">
                    <Lock className="size-3" aria-hidden="true" />
                    {setting.is_public ? "Public jsonb value" : "Internal jsonb value"}
                    <span className={cn("rounded bg-ink-900/8 px-1.5 py-0.5", "font-mono")}>
                      {kind}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </AdminForm>
  );
}
