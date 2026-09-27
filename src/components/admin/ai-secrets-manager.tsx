"use client";

import { useState } from "react";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminButtonAction, AdminForm, Field } from "@/components/admin/form-kit";
import { deleteAiSecretAction, saveAiSecretAction } from "@/lib/actions/admin";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/format";

export type SecretHint = { name: string; hint: string; updated_at: string };

/**
 * The services an admin is most likely to hold a key for. Picking one fills the
 * key name so nobody has to remember the exact variable spelling. The kind is
 * the `ai_providers.kind` a provider row should use with that key.
 */
const SERVICES = [
  {
    label: "Cloudflare Workers AI",
    name: "AI_CLOUDFLARE_API_KEY",
    kind: "cloudflare",
    note: "Runs on the Cloudflare account's Workers AI binding.",
  },
  {
    label: "OpenRouter",
    name: "AI_OPENROUTER_API_KEY",
    kind: "openrouter",
    note: "One key, many models.",
  },
  {
    label: "OpenAI (or compatible)",
    name: "OPENAI_API_KEY",
    kind: "openai_compatible",
    note: "Also covers any OpenAI-compatible gateway.",
  },
  {
    label: "Google Gemini",
    name: "AI_GEMINI_API_KEY",
    kind: "gemini",
    note: "",
  },
  {
    label: "Anthropic Claude",
    name: "AI_ANTHROPIC_API_KEY",
    kind: "anthropic",
    note: "",
  },
] as const;

/**
 * Credential manager for the AI centre. An admin stores or rotates a provider
 * key here; it is encrypted in Supabase Vault and the page only ever receives a
 * masked hint (the last four characters). A provider row then references the
 * name via `secret_ref`, so rotating a key is a console action, not a redeploy.
 *
 * When a provider row names a variable that is not listed here, the key is
 * expected in the server environment instead — both are supported, Vault wins.
 */
export function AiSecretsManager({ secrets }: { secrets: SecretHint[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  return (
    <section className="washi-panel p-4" aria-label="API keys">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <KeyRound className="size-4 text-jade-600" aria-hidden="true" />
          API keys
        </h2>
        {!adding ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add a key
          </Button>
        ) : null}
      </div>

      <p className="mt-1 flex items-start gap-2 text-sm text-ink-700/75">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-jade-600" aria-hidden="true" />
        <span>
          Keys are encrypted in Supabase Vault. The value is written once and never
          shown again — only a masked hint. A provider references a key by its name.
        </span>
      </p>

      {secrets.length === 0 ? (
        <p className="mt-3 rounded-xl bg-rice-200/60 px-3 py-2 text-xs text-ink-800">
          No stored keys yet. Providers fall back to the deterministic,
          database-grounded answer until one is added.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {secrets.map((secret) => (
            <li
              key={secret.name}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rice-100/70 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block break-all font-mono text-sm text-ink-900">
                  {secret.name}
                </span>
                <span className="text-2xs text-ink-700/65">
                  {secret.hint} · updated {formatDateTime(secret.updated_at)}
                </span>
              </span>
              <AdminButtonAction
                action={() => deleteAiSecretAction(secret.name)}
                variant="ghost"
                size="sm"
                confirm={`Delete the stored key "${secret.name}"?`}
              >
                Delete
              </AdminButtonAction>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-4 space-y-3 rounded-xl border border-miso-500/25 bg-miso-500/5 p-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-ink-800 uppercase">
              Which service?
            </p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {SERVICES.map((service) => {
                const selected = name === service.name;
                return (
                  <li key={service.name}>
                    <button
                      type="button"
                      onClick={() => setName(service.name)}
                      aria-pressed={selected}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-start transition-colors",
                        selected
                          ? "border-vermilion-600 bg-vermilion-600/8"
                          : "border-ink-900/12 bg-rice-50 hover:bg-rice-200",
                      )}
                    >
                      <span className="block text-sm font-medium text-ink-900">
                        {service.label}
                      </span>
                      {service.note ? (
                        <span className="mt-0.5 block text-2xs text-ink-700/65">
                          {service.note}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <AdminForm
            action={saveAiSecretAction}
            submitLabel="Save key"
            options={{
              successMessage: "Key stored.",
              resetOnSuccess: true,
              onSuccess: () => {
                setAdding(false);
                setName("");
              },
            }}
          >
            <Field
              name="name"
              label="Key name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="AI_CLOUDFLARE_API_KEY"
              hint="Pick a service above or type the name a provider's secret_ref uses."
            />
            <Field
              name="value"
              label="Key value"
              type="password"
              placeholder="paste the key"
              hint="Stored encrypted; never displayed again."
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setName("");
              }}
            >
              Cancel
            </Button>
          </AdminForm>
        </div>
      ) : null}
    </section>
  );
}

