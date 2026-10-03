"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { AdminForm } from "@/components/admin/form-kit";
import { toggleFeatureFlagAction, updateSettingsAction } from "@/lib/actions/admin";
import type { Json } from "@/lib/types/database";
import { humanise } from "@/lib/utils/format";

import { useErrorText, useI18n } from "@/components/i18n-provider";
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
            className="size-4 accent-vermilion-600"
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

type Kind = "boolean" | "number" | "string" | "json" | "time";

function kindOf(value: Json): Kind {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "json";
}

const CLOCK_VALUE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * A clock setting gets a real time picker rather than a free-text box. The owner
 * asked to choose opening hours "freely from the admin panel"; typing "14:00"
 * into a plain input invites a typo that would silently change the window. The
 * key shape and the stored value both have to agree, so a non-clock string that
 * happens to end in `_time` is left as text.
 */
function isClockSetting(key: string, value: Json): boolean {
  return key.endsWith("_time") && typeof value === "string" && CLOCK_VALUE.test(value);
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
 * Keys the dedicated `StoreHoursControl` owns. They are pulled out of the
 * generic list so the owner edits them graphically in one place rather than as
 * four separate jsonb rows that can drift apart.
 */
export const HOURS_SETTING_KEYS = [
  "ordering.accepting_orders",
  "ordering.hours_enabled",
  "ordering.open_time",
  "ordering.close_time",
] as const;

/**
 * Business settings editor. The action accepts a single JSON payload under the
 * `values` key, so each control writes into local state and one hidden input
 * carries the whole array. Types are inferred from the stored value, which
 * keeps numbers and booleans as jsonb numbers and booleans rather than strings.
 *
 * The owner asked for a friendlier, more graphical surface than raw jsonb rows,
 * so each field renders a translated name with the raw key beneath it, and
 * object-valued settings (social links, structured hours) are folded into an
 * "advanced" section rather than shown as a JSON textarea up front.
 */
export function SettingsForm({ settings }: { settings: SettingRow[] }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(settings.map((setting) => [setting.key, initialText(setting.value)])),
  );

  const { simple, advanced } = useMemo(() => {
    const simpleRows: SettingRow[] = [];
    const advancedRows: SettingRow[] = [];
    for (const setting of settings) {
      if (HOURS_SETTING_KEYS.includes(setting.key as (typeof HOURS_SETTING_KEYS)[number])) continue;
      if (kindOf(setting.value) === "json") advancedRows.push(setting);
      else simpleRows.push(setting);
    }
    return { simple: simpleRows, advanced: advancedRows };
  }, [settings]);

  const groups = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    for (const setting of simple) {
      const prefix = setting.key.includes(".")
        ? setting.key.slice(0, setting.key.indexOf("."))
        : "general";
      const bucket = map.get(prefix) ?? [];
      bucket.push(setting);
      map.set(prefix, bucket);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [simple]);

  // A friendly name is looked up per key; a missing translation returns the key
  // path itself, which is detected and replaced with the humanised key so the
  // label is always readable.
  const labelFor = (key: string) => {
    const translated = t(`admin.pages.settings.friendly.${key}`);
    return translated.startsWith("admin.pages.settings.friendly.") ? humanise(key) : translated;
  };
  const groupLabel = (prefix: string) => {
    const translated = t(`admin.pages.settings.groups.${prefix}`);
    return translated.startsWith("admin.pages.settings.groups.") ? humanise(prefix) : translated;
  };

  const payload = JSON.stringify(
    settings.map((setting) => ({
      key: setting.key,
      value: coerce(kindOf(setting.value), draft[setting.key] ?? initialText(setting.value)),
    })),
  );

  return (
    <AdminForm
      action={updateSettingsAction}
      submitLabel={t("admin.common.save")}
      options={{ successMessage: t("admin.common.saved") }}
    >
      <input type="hidden" name="values" value={payload} />

      {groups.map(([prefix, rows]) => (
        <fieldset key={prefix} className="washi-panel p-4">
          <legend className="px-1 font-display text-sm font-semibold text-ink-900">
            {groupLabel(prefix)}
          </legend>

          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {rows.map((setting) => {
              const kind = isClockSetting(setting.key, setting.value)
                ? "time"
                : kindOf(setting.value);
              const inputId = `setting-${setting.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
              const value = draft[setting.key] ?? initialText(setting.value);

              return (
                <div key={setting.key}>
                  <label
                    htmlFor={inputId}
                    className="block text-sm font-medium text-ink-900"
                  >
                    {labelFor(setting.key)}
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
                          className="size-4 accent-vermilion-600"
                        />
                        <span className="text-sm text-ink-800">
                          {value === "true"
                            ? t("admin.pages.loyalty.enabled")
                            : t("admin.pages.loyalty.disabled")}
                        </span>
                      </label>
                    ) : kind === "time" ? (
                      <input
                        id={inputId}
                        type="time"
                        value={value}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [setting.key]: event.target.value,
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-ink-900 outline-none focus:border-miso-500"
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
                        className="h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm text-ink-900 outline-none focus:border-miso-500"
                      />
                    )}
                  </div>

                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-700/60">
                    <Lock className="size-3" aria-hidden="true" />
                    {setting.is_public
                      ? t("admin.pages.settings.publicValue")
                      : t("admin.pages.settings.internalValue")}
                    <span className="rounded bg-ink-900/8 px-1.5 py-0.5 font-mono">
                      {setting.key}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      {advanced.length > 0 ? (
        <details className="washi-panel p-4">
          <summary className="cursor-pointer font-display text-sm font-semibold text-ink-900">
            {t("admin.pages.settings.advanced")}
          </summary>
          <p className="mt-1 text-xs text-ink-700/70">
            {t("admin.pages.settings.advancedHint")}
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {advanced.map((setting) => {
              const inputId = `setting-${setting.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
              return (
                <div key={setting.key}>
                  <label htmlFor={inputId} className="block text-sm font-medium text-ink-900">
                    {labelFor(setting.key)}
                  </label>
                  {setting.description ? (
                    <p className="mt-0.5 text-xs text-ink-700/65">{setting.description}</p>
                  ) : null}
                  <textarea
                    id={inputId}
                    rows={3}
                    value={draft[setting.key] ?? initialText(setting.value)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [setting.key]: event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2 font-mono text-xs text-ink-900 outline-none focus:border-miso-500"
                  />
                  <p className="mt-1 font-mono text-[11px] text-ink-700/60">{setting.key}</p>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </AdminForm>
  );
}
