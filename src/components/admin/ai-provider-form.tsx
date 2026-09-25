"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { AdminForm, Field } from "@/components/admin/form-kit";
import { saveAiProviderAction } from "@/lib/actions/admin";
import type { Database } from "@/lib/types/database";

type Provider = Database["public"]["Tables"]["ai_providers"]["Row"];

const KINDS = ["builtin", "openrouter", "cloudflare", "pollinations", "gemini", "anthropic", "openai_compatible"] as const;

/**
 * Create/edit form for an AI provider. Only the *name* of the environment
 * variable holding the key is ever sent — no credential is read from or written
 * to the browser. The kind "builtin" is the deterministic, database-grounded
 * provider that needs no key.
 */
export function AiProviderForm({ provider }: { provider: Provider | null }) {
  const editing = Boolean(provider);
  const [kind, setKind] = useState<string>(provider?.kind ?? "openai_compatible");
  const [isFallback, setIsFallback] = useState(provider?.is_fallback ?? false);
  const [isEnabled, setIsEnabled] = useState(provider?.is_enabled ?? false);

  return (
    <AdminForm
      action={saveAiProviderAction}
      submitLabel={editing ? "Save provider" : "Create provider"}
      options={{ successMessage: editing ? "Provider updated." : "Provider created." }}
    >
      {provider ? <input type="hidden" name="id" value={provider.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="name"
          label="Name"
          defaultValue={provider?.name ?? ""}
          placeholder="Primary OpenAI-compatible"
        />

        <div>
          <label htmlFor="kind" className="block text-sm font-medium text-ink-900">
            Provider kind
          </label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            {KINDS.map((option) => (
              <option key={option} value={option}>
                {option === "builtin" ? "builtin — deterministic, no key" : option}
              </option>
            ))}
          </select>
        </div>

        <Field
          name="baseUrl"
          label="Base URL"
          type="url"
          defaultValue={provider?.base_url ?? ""}
          placeholder="https://api.example.com/v1"
          hint="Ignored by the builtin provider."
        />

        <Field
          name="model"
          label="Model"
          defaultValue={provider?.model ?? ""}
          placeholder="gpt-4o-mini"
        />

        <Field
          name="secretRef"
          label="API key environment variable"
          defaultValue={provider?.secret_ref ?? ""}
          placeholder="AI_API_KEY"
          hint="The NAME of the env var, never the key itself."
        />

        <Field
          name="priority"
          label="Priority"
          type="number"
          defaultValue={String(provider?.priority ?? 100)}
          hint="Lower runs first in the chain."
        />

        <Field
          name="monthlyTokenQuota"
          label="Monthly token quota"
          type="number"
          defaultValue={
            provider?.monthly_token_quota === null ||
            provider?.monthly_token_quota === undefined
              ? ""
              : String(provider.monthly_token_quota)
          }
          hint="Blank means unlimited."
        />

        <Field
          name="maxRequestsPerMinute"
          label="Max requests per minute"
          type="number"
          defaultValue={String(provider?.max_requests_per_minute ?? 20)}
        />
      </div>

      {kind !== "builtin" ? (
        <p className="flex items-start gap-2 rounded-xl bg-miso-500/10 p-3 text-xs text-miso-600">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            The key lives only in the server environment. Enter the variable name —
            if it is missing the platform falls back to the deterministic provider.
          </span>
        </p>
      ) : null}

      <input type="hidden" name="isEnabled" value={isEnabled ? "on" : ""} />
      <input type="hidden" name="isFallback" value={isFallback ? "on" : ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-900/12 bg-rice-50 p-3">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(event) => setIsEnabled(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-indigo-600"
          />
          <span>
            <span className="block text-sm font-medium text-ink-900">Enabled</span>
            <span className="mt-0.5 block text-xs text-ink-700/65">
              Only enabled providers are added to the chain.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-900/12 bg-rice-50 p-3">
          <input
            type="checkbox"
            checked={isFallback}
            onChange={(event) => setIsFallback(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-indigo-600"
          />
          <span>
            <span className="block text-sm font-medium text-ink-900">Fallback</span>
            <span className="mt-0.5 block text-xs text-ink-700/65">
              Tried when the primary provider errors or is rate-limited.
            </span>
          </span>
        </label>
      </div>
    </AdminForm>
  );
}
