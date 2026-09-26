"use client";

import { useState } from "react";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminButtonAction, AdminForm, Field } from "@/components/admin/form-kit";
import { deleteAiSecretAction, saveAiSecretAction } from "@/lib/actions/admin";
import { formatDateTime } from "@/lib/utils/format";

export type SecretHint = { name: string; hint: string; updated_at: string };

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

  return (
    <section className="washi-panel p-4" aria-label="API credentials">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <KeyRound className="size-4 text-jade-600" aria-hidden="true" />
          API keys
        </h2>
        {!adding ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add or rotate a key
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
                <span className="block font-mono text-sm text-ink-900">{secret.name}</span>
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
        <div className="mt-3 rounded-xl border border-miso-500/25 bg-miso-500/5 p-3">
          <AdminForm
            action={saveAiSecretAction}
            submitLabel="Save key"
            options={{
              successMessage: "Key stored.",
              resetOnSuccess: true,
              onSuccess: () => setAdding(false),
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                name="name"
                label="Key name"
                placeholder="OPENROUTER_API_KEY"
                hint="The name a provider's secret_ref points at."
              />
              <Field
                name="value"
                label="Key value"
                type="password"
                placeholder="paste the provider key"
                hint="Stored encrypted; never displayed again."
              />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </AdminForm>
        </div>
      ) : null}
    </section>
  );
}
