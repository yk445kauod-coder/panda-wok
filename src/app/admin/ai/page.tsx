import { ShieldCheck, KeyRound, Database } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import {
  listAiProviders,
  listAiPrompts,
  listAiRequests,
} from "@/lib/services/admin-catalog";
import { getAiUsage } from "@/lib/crm/insights";
import { externalAiConfigured } from "@/lib/config/env";
import { AiProviderForm } from "@/components/admin/ai-provider-form";
import { AdminForm, Field, TextArea, Toggle } from "@/components/admin/form-kit";
import { saveAiPromptAction } from "@/lib/actions/admin";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RunStatusBadge } from "@/components/admin/run-status";
import { formatDateTime, formatNumber, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * AI administration centre. Providers, prompts and the chain are managed here.
 * Credentials are never handled by the browser: a provider row stores the name
 * of the environment variable holding the key, and only that reference is
 * displayed.
 */
export default async function AdminAiPage() {
  await requireCapability("ai.manage");

  const [providers, prompts, usage, recent] = await Promise.all([
    listAiProviders(),
    listAiPrompts(),
    getAiUsage(30),
    listAiRequests(20),
  ]);

  const configured = externalAiConfigured();
  const enabledProvider = providers.find((p) => p.is_enabled && !p.is_fallback);
  const fallbackProvider = providers.find((p) => p.is_fallback && p.is_enabled);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">AI centre</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            The assistant and CRM insights always answer from the live database. A
            configured model only rephrases those facts — it is never the source of truth.
          </p>
        </div>
        <Badge tone={configured ? "success" : "info"}>
          {configured ? "External provider configured" : "Deterministic mode"}
        </Badge>
      </header>

      <section className="washi-panel p-4" aria-label="Provider chain">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <ShieldCheck className="size-4 text-jade-600" aria-hidden="true" />
          Provider chain
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          Requests always resolve in this order. The deterministic provider cannot fail
          and cannot invent a dish, price or availability — it renders only database rows.
        </p>

        <ol className="mt-4 grid gap-3 lg:grid-cols-3">
          <ChainStep
            step="1"
            title="Primary"
            tone="indigo"
            name={
              enabledProvider
                ? `${enabledProvider.name}${enabledProvider.model ? ` · ${enabledProvider.model}` : ""}`
                : configured
                  ? "Environment provider"
                  : null
            }
            emptyLabel="No primary provider enabled"
            note={
              configured
                ? "Configured through server environment variables. Keys stay on the server."
                : "Add AI_BASE_URL, AI_MODEL and AI_API_KEY to the server environment to enable a model."
            }
          />
          <ChainStep
            step="2"
            title="Fallback"
            tone="info"
            name={
              fallbackProvider
                ? `${fallbackProvider.name}${fallbackProvider.model ? ` · ${fallbackProvider.model}` : ""}`
                : null
            }
            emptyLabel="No fallback provider enabled"
            note="Used automatically when the primary times out or errors."
          />
          <ChainStep
            step="3"
            title="Safe deterministic fallback"
            tone="success"
            name="menu-grounded-rules"
            emptyLabel=""
            note="Always available. Answers from menu, pricing and setting rows only."
            always
          />
        </ol>
      </section>

      <section className="washi-panel p-4" aria-label="Usage summary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Usage, last 30 days
            </h2>
            <p className="text-xs text-ink-700/70">
              Counted from real AI request rows. With no external provider these are
              deterministic answers, which cost nothing.
            </p>
          </div>
          <a
            href="/admin/ai/usage"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Full usage &amp; logs
          </a>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Requests" value={formatNumber(usage.totals.requests)} />
          <Metric label="Errors" value={formatNumber(usage.totals.errors)} />
          <Metric label="Fallback rate" value={`${usage.totals.fallbackRate}%`} />
          <Metric
            label="Estimated cost"
            value={`${usage.totals.estimatedCost.toFixed(2)} EGP`}
          />
        </dl>

        {usage.totals.requests === 0 ? (
          <p className="mt-3 text-xs text-ink-700/60">
            No AI requests recorded in this window.
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="washi-panel p-4" aria-label="Providers">
          <h2 className="font-display text-lg font-semibold text-ink-900">Providers</h2>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-700/70">
            <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Only the environment variable name is stored. API keys are never written to the
            database or sent to the browser.
          </p>

          {providers.length === 0 ? (
            <EmptyState
              className="mt-3"
              title="No providers registered"
              description="Register a provider to record which model backs the assistant, or leave it empty to run deterministically."
            />
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/8">
              {providers.map((provider) => (
                <li key={provider.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
                      {provider.name}
                      {provider.is_enabled ? (
                        <Badge tone="success">Enabled</Badge>
                      ) : (
                        <Badge tone="neutral">Disabled</Badge>
                      )}
                      {provider.is_fallback ? <Badge tone="info">Fallback</Badge> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-700/70">
                      {humanise(provider.kind)}
                      {provider.model ? ` · ${provider.model}` : ""}
                      {provider.priority ? ` · priority ${provider.priority}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-700/60">
                      {provider.secret_ref
                        ? `Key from env: ${provider.secret_ref}`
                        : "No key required (builtin)"}
                      {provider.monthly_token_quota
                        ? ` · quota ${formatNumber(provider.monthly_token_quota)} tokens/month`
                        : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="washi-panel p-4" aria-label="Add or edit a provider">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Register a provider
          </h2>
          <p className="mt-1 text-xs text-ink-700/70">
            Record which model should back the assistant. Enabling a provider here does not
            supply a key — the key comes from the server environment.
          </p>
          <div className="mt-3">
            <AiProviderForm provider={null} />
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="washi-panel p-4" aria-label="System instructions">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            System instructions
          </h2>
          <p className="mt-1 text-xs text-ink-700/70">
            Editable prompts keyed by surface. An inactive prompt is ignored and the built-in
            safe instruction is used instead.
          </p>

          {prompts.length === 0 ? (
            <EmptyState
              className="mt-3"
              title="No custom prompts"
              description="The assistant runs on its built-in, strictly grounded instruction until you add one."
            />
          ) : (
            <ul className="mt-3 space-y-3">
              {prompts.map((prompt) => (
                <li key={prompt.id} className="rounded-xl border border-ink-900/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-rice-200 px-1.5 py-0.5 text-xs text-ink-800">
                      {prompt.key}
                    </code>
                    {prompt.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                    <span className="text-xs text-ink-700/60">
                      temp {Number(prompt.temperature)} · max {prompt.max_tokens} tokens
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs text-ink-800/85">
                    {prompt.system_instruction}
                  </p>
                  <p className="mt-1 text-xs text-ink-700/55">
                    Updated {formatDateTime(prompt.updated_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="washi-panel p-4" aria-label="Create or update a prompt">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Create or update a prompt
          </h2>
          <p className="mt-1 text-xs text-ink-700/70">
            Saving with a key that already exists updates it. The instruction must forbid
            inventing menu items, prices or availability.
          </p>
          <div className="mt-3">
            <AdminForm
              action={saveAiPromptAction}
              submitLabel="Save prompt"
              options={{ successMessage: "Prompt saved." }}
            >
              <Field
                name="key"
                label="Prompt key"
                hint="For example assistant.menu or crm_insights."
                placeholder="assistant.menu"
              />
              <TextArea
                name="systemInstruction"
                label="System instruction"
                rows={7}
                placeholder="You are the Panda Wok assistant. Use only the DATA block…"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="temperature" label="Temperature" defaultValue="0.2" />
                <Field name="maxTokens" label="Max tokens" defaultValue="500" />
              </div>
              <Toggle name="isActive" label="Active" defaultChecked hint="Owners only." />
            </AdminForm>
          </div>
        </section>
      </div>

      <section className="washi-panel p-4" aria-label="Knowledge sources">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <Database className="size-4 text-ink-700/70" aria-hidden="true" />
          Knowledge sources
        </h2>
        <p className="mt-1 text-sm text-ink-700/75">
          The assistant is grounded in the live database: menu, categories, prices,
          availability and brand contact settings. Those are the authoritative sources, so
          no separate document is needed for them. Additional reference documents can be
          attached through the knowledge sources table and are only consulted when they are
          enabled.
        </p>
      </section>

      <section className="washi-panel p-4" aria-label="Recent AI requests">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          Recent requests
        </h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700/70">No requests recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-900/8">
            {recent.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm text-ink-900">
                  {humanise(request.surface)}
                  <span className="text-ink-700/70">
                    {" · "}
                    {request.provider ?? "unknown"}
                    {request.model ? ` / ${request.model}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-700/65">
                  {request.latency_ms ? `${request.latency_ms} ms` : ""}
                  <RunStatusBadge status={request.status} />
                  <span>{formatDateTime(request.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChainStep({
  step,
  title,
  name,
  emptyLabel,
  note,
  tone,
  always = false,
}: {
  step: string;
  title: string;
  name: string | null;
  emptyLabel: string;
  note: string;
  tone: "indigo" | "info" | "success";
  always?: boolean;
}) {
  return (
    <li className="rounded-xl border border-ink-900/10 bg-rice-50 p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-rice-200 text-xs font-semibold text-ink-800">
          {step}
        </span>
        <span className="text-sm font-medium text-ink-900">{title}</span>
        {always ? <Badge tone={tone}>Always on</Badge> : null}
      </div>
      <p className="mt-2 text-sm text-ink-900">
        {name ?? <span className="text-ink-700/60">{emptyLabel}</span>}
      </p>
      <p className="mt-1 text-xs text-ink-700/70">{note}</p>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-900/10 bg-rice-50 p-3">
      <dt className="text-xs text-ink-700/70">{label}</dt>
      <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-ink-900">
        {value}
      </dd>
    </div>
  );
}
