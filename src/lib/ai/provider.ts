import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { serverEnv } from "@/lib/config/env";
import { tryCreateAdminSupabase } from "@/lib/supabase/server";

/* ================================================================
 * Panda Wok AI provider layer
 *
 * A single serialisable "kind" selects the wire shape for every remote
 * provider (OpenRouter, Cloudflare Workers AI, Pollinations, Gemini,
 * Anthropic and OpenAI-compatible gateways). Keys are only ever read from
 * the server environment or from ai_providers.secret_ref (the name of a
 * server-side env variable ) - never from the client bundle. The deterministic
 * provider is always the last resort, so an outage or a missing credential
 * degrades into a correct, database-grounded answer instead of an error page.
 *
 * Cost estimates are rough and only feed internal usage accounting. The model
 * is never the source of truth: it only rephrases the data-grounded block the
 * caller supplies.
 *
 * Provider env block key <<kind>> resolves like this (specific wins):
 *   AI_<KIND>_MODEL, AI_<KIND>_BASE_URL, AI_<KIND>_API_KEY
 * Generic fallbacks: AI_MODEL, AI_BASE_URL, AI_API_KEY
 * ================================================================ */

export type AiProviderKind =
  | "openrouter"
  | "cloudflare"
  | "pollinations"
  | "gemini"
  | "anthropic"
  | "openai_compatible";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompletionRequest = {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
};

export type CompletionResult = {
  text: string;
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedCost: number | null;
  /** `fallback` means the deterministic provider answered, not a model. */
  status: "ok" | "fallback";
};

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  readonly kind: "builtin" | "remote" | "bound";
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/** Rough token estimate used only for usage accounting when a provider omits it. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Split a system message from chat turns for providers without a system role. */
function splitSystem(request: CompletionRequest): {
  system: string | null;
  turns: ChatMessage[];
} {
  const system = request.messages.find((m) => m.role === "system");
  const turns = request.messages.filter((m) => m !== system);
  return { system: system?.content ?? null, turns };
}

/** USD per 1M tokens (input/output) for known models. Kept conservative. */
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "gpt-4o": { input: 2.5, output: 10 },
};

function estimateCostUsd(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  const key = Object.keys(PRICE_TABLE).find((k) => model.includes(k));
  if (!key || promptTokens == null || completionTokens == null) return null;
  const p = PRICE_TABLE[key];
  return (
    Number(((promptTokens / 1_000_000) * p.input).toFixed(6)) +
    Number(((completionTokens / 1_000_000) * p.output).toFixed(6))
  );
}

/**
 * Deterministic provider. It never invents prose: the caller supplies a
 * pre-rendered, data-grounded answer and this provider returns it verbatim.
 * This is the guaranteed-available path when no external model is configured.
 * All deterministic renderings are built from live database rows, never free
 * text, so this provider is both the fallback and the factual floor.
 */
export class DeterministicProvider implements AiProvider {
  readonly name = "deterministic";
  readonly model = "menu-grounded-rules";
  readonly kind = "builtin" as const;

  constructor(private readonly render: (request: CompletionRequest) => string) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const text = this.render(request);
    const promptTokens = request.messages.reduce(
      (sum,m) => sum + estimateTokens(m.content),
      0,
    );
    return {
      text,
      provider: this.name,
      model: this.model,
      promptTokens,
      completionTokens: estimateTokens(text),
      estimatedCost: 0,
      status: "fallback",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Remote adapters                                                      */
/* ------------------------------------------------------------------ */

type ParsedOk = {
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

type WireSpec = {
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  parse(text: string): ParsedOk;
};

/** Raised when a remote provider responds with an HTTP error. */
export class RemoteRequestFailure extends Error {
  constructor(provider: string, status: number, detail: string) {
    super(`Provider ${provider} responded ${status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    this.name = "RemoteRequestFailure";
  }
}

function parseOpenAiLike(text: string): ParsedOk {
  const payload = JSON.parse(text) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
  return {
    text: content,
    promptTokens: payload.usage?.prompt_tokens ?? null,
    completionTokens: payload.usage?.completion_tokens ?? null,
  };
}

function parseGemini(text: string): ParsedOk {
  const payload = JSON.parse(text) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const content =
    payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  return {
    text: content,
    promptTokens: payload.usageMetadata?.promptTokenCount ?? null,
    completionTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
  };
}

function parsePollinations(text: string): ParsedOk {
  return { text: text.trim(), promptTokens: null, completionTokens: null };
}

function parseCloudflare(text: string): ParsedOk {
  const raw = JSON.parse(text) as unknown;
  if (typeof raw === "string") return { text: raw.trim(), promptTokens: null, completionTokens: null };

  const obj = raw as Record<string, unknown>;
  if (typeof obj.result === "string") {
    return { text: obj.result.trim(), promptTokens: null, completionTokens: null };
  }
  if (obj.result && typeof obj.result === "object") {
    const r = obj.result as Record<string, unknown>;
    if (typeof r.response === "string") return { text: r.response.trim(), promptTokens: null, completionTokens: null };
    if (r.response && typeof r.response === "object") {
      const nested = r.response as Record<string, unknown>;
      if (typeof nested.response === "string") return { text: nested.response.trim(), promptTokens: null, completionTokens: null };
    }
    if (Array.isArray(r.choices)) return parseOpenAiLike(JSON.stringify(raw));
  }
  const direct = raw as { response?: string; output?: string };
  if (typeof direct.response === "string") return { text: direct.response.trim(), promptTokens: null, completionTokens: null };
  if (typeof direct.output === "string") return { text: direct.output.trim(), promptTokens: null, completionTokens: null };
  return { text: "", promptTokens: null, completionTokens: null };
}

function parseAnthropic(text: string): ParsedOk {
  const payload = JSON.parse(text) as {
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const content = payload.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim() ?? "";
  return {
    text: content,
    promptTokens: payload.usage?.input_tokens ?? null,
    completionTokens: payload.usage?.output_tokens ?? null,
  };
}

async function postJson(spec: WireSpec, timeoutMs: number): Promise<ParsedOk> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(spec.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...spec.headers },
      body: JSON.stringify(spec.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new RemoteRequestFailure("remote", response.status, detail);
    }
    return spec.parse(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

export type RemoteProviderConfig = {
  name: string;
  kind: AiProviderKind;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

/** Single entry point for every remote provider: shapes the wire request. */
export class RemoteProvider implements AiProvider {
  readonly kind = "remote" as const;
  readonly name: string;
  readonly model: string;

  constructor(private readonly cfg: RemoteProviderConfig) {
    this.name = cfg.name;
    this.model = cfg.model;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const spec = this.buildSpec(request);
    const parsed = await postJson(spec, this.cfg.timeoutMs ?? 25_000);
    const estimatedCost = estimateCostUsd(this.model, parsed.promptTokens, parsed.completionTokens);

    if (!parsed.text) throw new Error(`Provider ${this.name} returned an empty completion`);

    return {
      text: parsed.text,
      provider: this.name,
      model: this.model,
      promptTokens: parsed.promptTokens,
      completionTokens: parsed.completionTokens,
      estimatedCost,
      status: "ok",
    };
  }

  private buildSpec(request: CompletionRequest): WireSpec {
    const base = (this.cfg.baseUrl ?? "").replace(/\/$/, "");
    switch (this.cfg.kind) {
      case "openrouter": {
        const endpoint = `${(base || "https://openrouter.ai/api/v1")}/chat/completions`;
        return {
          endpoint,
          headers: { authorization: `Bearer ${this.cfg.apiKey}` },
          body: {
            model: this.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxTokens,
          },
          parse: parseOpenAiLike,
        };
      }

      case "openai_compatible": {
        const endpoint = `${(base || "https://api.openai.com/v1")}/chat/completions`;
        return {
          endpoint,
          headers: { authorization: `Bearer ${this.cfg.apiKey}` },
          body: {
            model: this.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxTokens,
          },
          parse: parseOpenAiLike,
        };
      }

      case "cloudflare": {
        const root = base.includes("/ai/run") ? base.split("/ai/run")[0] : base;
        const endpoint =
          `${(root || "https://api.cloudflare.com/client/v4/accounts")}/ai/run/${this.model}`;
        return {
          endpoint,
          headers: { authorization: `Bearer ${this.cfg.apiKey}` },
          body: {
            messages: request.messages,
            max_tokens: request.maxTokens,
            temperature: request.temperature,
          },
          parse: parseCloudflare,
        };
      }

      case "pollinations": {
        const { system, turns } = splitSystem(request);
        const u = new URL(base || "https://text.pollinations.ai/");
        u.searchParams.set("model", this.model);
        u.searchParams.set("temperature", String(request.temperature));
        u.searchParams.set("max_tokens", String(request.maxTokens));
        if (system) u.searchParams.set("system", system);
        return {
          endpoint: u.toString(),
          headers: this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {},
          body: { messages: turns },
          parse: parsePollinations,
        };
      }

      case "gemini": {
        const { system, turns } = splitSystem(request);
        const contents = turns.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
        const apiKey = this.cfg.apiKey ?? "";
        const root = (base || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
        return {
          endpoint: `${root}/models/${this.model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          headers: {},
          body: {
            contents,
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            generationConfig: { temperature: request.temperature, maxOutputTokens: request.maxTokens },
          },
          parse: parseGemini,
        };
      }

      case "anthropic": {
        const { system, turns } = splitSystem(request);
        return {
          endpoint: `${(base || "https://api.anthropic.com/v1")}/messages`,
          headers: {
            "x-api-key": this.cfg.apiKey ?? "",
            "anthropic-version": "2023-06-01",
          },
          body: {
            model: this.model,
            max_tokens: request.maxTokens,
            system: system ?? undefined,
            messages: turns.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
          parse: parseAnthropic,
        };
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cloudflare Workers AI binding provider (keyless)                     */
/* ------------------------------------------------------------------ */

/**
 * Model name for the Workers AI binding provider. Verified against the account's
 * /ai/models/search on 2026-09-23 — the strongest available text model.
 * Deployments may override it via an ai_providers row with secret_ref unset.

 */
const CF_BINDING_DEFAULT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

/**
 * Detects and returns the Workers AI binding from the Cloudflare context. The
 * binding only exists in the real Worker and during `wrangler dev` — never in
 * a plain `next dev`/`next build` (Node runtime without bindings), so this
 * is deliberately safe: it returns null instead of throwing when absent (the
 * chain then falls through to the configured remote providers and the deterministic
 * floor, keeping the assistant alive in every environment).
 */
export async function getWorkersAiBinding(): Promise<{ ai: unknown; envName: string } | null> {
  try {
    // Async mode works in the worker entrypoint, in `wrangler dev` and — via
    // wrangler's platform proxy — in `next dev`. Sync mode would throw during
    // static generation, so we never use it here..
    const { env } = await getCloudflareContext({ async: true });
    // The binding name is fixed ("AI") by wrangler.jsonc — deliberately not
    // configurable, because the app must fail closed (no key, no back-door
    // remote calls) if an operator renames it by accident..
    const binding = (env as Record<string, unknown> | undefined)?.["AI"];
    // Truthy check: bindings are objects in prod and in dev proxy; undefined
    // in plain Node builds. A falsy but present value also counts as absent..
    return binding ? { ai: binding, envName: "AI" } : null;
  } catch {
    // getCloudflareContext throws outside the Cloudflare platform (e.g. plain
    // `next build` on a Node server only). That is expected and must not break
    // the request — the chain continues without this provider..
    return null;
  }
}

/**
 * Requests a text-generation completion from the Workers AI REST binding,
 * mapping the message list onto the model's supported prompt shapes..
 *
 * The binding route is `<account>/ai/run/<model>` on the internal API, so it
 * never needs a user-side credential (the Worker's own auth is used). It is
 * therefore usable as the primary provider with zero secrets, and is the only
 * remote provider that the platform enables by default..
 */
async function runWorkersAi(
  ai: { run(model: string, body: Record<string, unknown>): Promise<unknown> },
  model: string,
  request: CompletionRequest,
): Promise<{ text: string; promptTokens: number | null; completionTokens: number | null }> {
  const { system, turns } = splitSystem(request);

  // Llama-family models accept the OpenAI chat shape via "messages"; most
  // Workers AI text models do too.The body mirrors what the REST /ai/run
  // endpoint accepts, so the binding implements the same contract..

  let result: unknown;
  try {
    result = await ai.run(model, {
      messages: turns,
      ...(system ? { system: system } : {}),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    });
  } catch (error) {
    // Surface the underlying Workers AI error (throttling, invalid model...)
    throw new Error(
      error instanceof Error ? `Workers AI: ${error.message}` : "Workers AI request failed",
    );
  }

  const parsed = parseCloudflare(JSON.stringify(result ?? ""));
  if (!parsed.text) throw new Error("Workers AI returned an empty completion");
  return parsed;

}

/** Provider that speaks to the Cloudflare Workers AI binding — no API key. */
export class CloudflareBindingProvider implements AiProvider {
  readonly name: string;
  readonly kind = "bound" as const;
  readonly model: string;
  private readonly ai: { run(model: string, body: Record<string, unknown>): Promise<unknown> };
  private readonly envName: string;

  constructor(binding: { run(model: string, body: Record<string, unknown>): Promise<unknown> }, opts: { model?: string|null; name?: string|null; envName: string }) {
    this.ai = binding;
    this.envName = opts.envName;
    this.model = opts.model ?? CF_BINDING_DEFAULT_MODEL;


    // "Workers AI (binding)" keeps the admin usage page readable when the
    // provider has no database row yet..
    this.name = "Workers AI";
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const parsed = await runWorkersAi(this.ai, this.model, request);
    return {
      text: parsed.text,
      provider: this.name,
      model: this.model,
      promptTokens: parsed.promptTokens ?? request.messages.reduce(
        (sum, m) => sum + m.content.length,
        0,
      ),
      completionTokens: parsed.completionTokens ?? estimateTokens(parsed.text),
      estimatedCost: null, // billed in-account; not unit-priced here
      status: "ok",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Chain building                                                       */
/* ------------------------------------------------------------------ */

export type ProviderChain = {
  primary: AiProvider | null;
  /** Secondary remote providers tried in order before the deterministic floor. */
  fallbacks: AiProvider[];
  fallback: AiProvider;
};

function envBlock(kind: AiProviderKind, suffix: "MODEL" | "BASE_URL" | "API_KEY"): string | undefined {
  const scoped = (serverEnv as Record<string, string | undefined>)[`AI_${kind.toUpperCase()}_${suffix}`];
  if (scoped) return scoped;
  return (serverEnv as Record<string, string | undefined>)[`AI_${suffix}`];
}

export type DbProviderRow = {
  kind: string;
  name: string;
  model: string | null;
  base_url: string | null;
  secret_ref: string | null;
  is_enabled: boolean;
  is_fallback: boolean;
  priority: number;
  monthly_token_quota: number | null;
  max_requests_per_minute: number;
  config?: unknown;
};

/** Requests counting a provider's usage for quota enforcement. Reads the
 * usage ledger rather than an in-memory store, so it survives restarts and is
 * consistent across serverless instances. Returns {(used, left)} over the
 * provider-selected window (default: the current calendar month for the token
 * quota, the current calendar minute for the RPM cap). */
export async function getAiProviderUsage(config: { name: string; kind: string }): Promise<{
  monthUsedTokens: number;
  minuteRequests: number;
}> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { monthUsedTokens: 0, minuteRequests: 0 };

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const minuteStart = new Date(now.getTime() - 60 * 1000).toISOString();

  try {
    const { count: minuteReqs } = await admin
      .from("ai_requests")
      .select("id", { count: "exact", head: true })
      .eq("provider", config.name)
      .gte("created_at", minuteStart);

    // Counting rows counts requests, not tokens; the token figures are summed
    // via a separate aggregate query because the head:true form cannot sum..
    const { data: sums } = await admin
      .from("ai_requests")
      .select("prompt_tokens,completion_tokens")
      .eq("provider", config.name)
      .gte("created_at", monthStart);

    const monthUsedTokens =
      (sums ?? []).reduce(
        (acc: number, r: { prompt_tokens: number | null; completion_tokens: number | null }) =>
          acc + Number(r.prompt_tokens ?? 0) + Number(r.completion_tokens ?? 0),
        0,
      );

    return { monthUsedTokens, minuteRequests: minuteReqs ?? 0 };
  } catch {
    // Quota accounting must never break the assistant: on failure (e.g.
    // service key missing) we treat usage as zero and let requests proceed..
    return { monthUsedTokens: 0, minuteRequests: 0 };
  }
}

/** Wraps a provider completing a request with quota enforcement: monthly token
 * cap and requests-per-minute cap, both stored editable in ai_providers (admin
 * controls the numbers, never the code). When a quota is hit the deterministic
 * provider answers instead of the model, and the caller logs the rate_limited
 * outcome via the normal usage path (no extra table).
 */
export class QuotaEnforcedProvider implements AiProvider {
  readonly name: string;
  readonly model: string;
  readonly kind: "remote" | "bound";
  private readonly inner: AiProvider;
  private readonly opts: {
    monthlyTokenQuota: number | null;
    maxRequestsPerMinute: number;
  };

  constructor(
    inner: AiProvider,
    opts: {
      monthlyTokenQuota: number | null;
      maxRequestsPerMinute: number;
    },
  ) {
    this.inner = inner;
    this.opts = opts;
    this.name = inner.name;
    this.model = inner.model;
    this.kind = inner.kind as "remote" | "bound";
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const usage = await getAiProviderUsage({ name: this.inner.name, kind: this.inner.kind });
    const minuteLimit = Math.max(1, this.opts.maxRequestsPerMinute);
    if (usage.minuteRequests >= minuteLimit ||
      (this.opts.monthlyTokenQuota !== null &&
        usage.monthUsedTokens >= this.opts.monthlyTokenQuota)) {
      // Quota exhausted: the caller records the outcome via the normal usage
      // ledger; here we degrade to the deterministic floor instead of erroring..
      return {
        text: "I've reached my answer limit for now. Please check the menu or contact the kitchen.",
        provider: "deterministic",
        model: "quota-floor",
        promptTokens: 0,
        completionTokens: 0,
        estimatedCost: 0,
        status: "fallback",
      };
    }
    return this.inner.complete(request);
  }
}

export type AiRunResult = CompletionResult & {
  latencyMs: number;
  error: string | null;
};

/**
 * Runs the chain and reports the outcome. Errors from primary providers are
 * captured, not thrown, and the deterministic fallback answers instead.
 */
export async function runCompletion(
  chain: ProviderChain,
  request: CompletionRequest,
): Promise<AiRunResult> {
  const started = Date.now();

  if (chain.primary) {
    try {
      const result = await chain.primary.complete(request);
      return { ...result, latencyMs: Date.now() - started, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider failed";
      const fallback = await chain.fallback.complete(request);
      return {
        ...fallback,
        latencyMs: Date.now() - started,
        error: message,
      };
    }
  }

  const result = await chain.fallback.complete(request);
  return { ...result, latencyMs: Date.now() - started, error: null };
}

/* ------------------------------------------------------------------ */
/* Database-driven providers (admin AI centre)                         */
/* ------------------------------------------------------------------ */

/** All provider kinds the admin may configure; every other kind was removed
 * from the app (the assistant only speaks Pollinations + Cloudflare Workers AI..
 */
export const DB_PROVIDER_KINDS = ["cloudflare", "pollinations", "openai_compatible"] as const;

/** Rows the runtime treats as configurable providers, plus an optional
 * detected Workers AI binding source. */
export type DbProviderSelection = {
  rows: DbProviderRow[];
  binding?: { ai: unknown; envName: string } | null;
};

/**
 * Turns a database ai_providers row into a runtime provider. This is where
 * admin-managed providers actually take effect. Supported kinds:
 *
 *  - cloudflare      → the Workers AI binding (no API key; keyless primary
 *                         sourced from the current Worker's env.AI)
 *  - pollinations      → public text API (base_url/model configurable;
 *                         optional secret_ref for auth'd/acount gateways)
 *  - openai_compatible → generic gateway; needs secret_ref + base_url
 *
 * Secret values never ride in the row — only the env-var name in secret_ref,
 * which either the deployed Worker's env or serverEnv provides. Quotas are
 * enforced per-provider by the ai_requests ledger (admin-editable numbers)..
 */
export async function resolveDbProvider(
  row: DbProviderRow,
  opts: { binding?: { ai: unknown; envName: string } | null } = {},
): Promise<AiProvider | null> {
  const quota = {
    monthlyTokenQuota: row.monthly_token_quota ?? null,
    maxRequestsPerMinute: Math.max(1, row.max_requests_per_minute ?? 20),
  };

  const kind = (row.kind ?? "openai_compatible") as string;

  if (kind === "cloudflare") {
    const binding = opts.binding ?? (await getWorkersAiBinding());
    if (!binding || typeof binding.ai !== "object" || binding.ai === null) return null;
    return new QuotaEnforcedProvider(
      new CloudflareBindingProvider(binding.ai as never, {
        model: row.model ?? null,
        name: row.name,
        envName: binding.envName,
      }),
      quota,
    );
  }

  if (kind === "pollinations") {
    const baseUrl = (row.base_url ?? envBlock("pollinations", "BASE_URL"))?.replace(/\/+$/, "");
    const apiKey = row.secret_ref ? process.env[row.secret_ref] : undefined;
    const model = row.model ?? envBlock("pollinations", "MODEL") ?? "openai";
    if (!baseUrl) return null;
    return new QuotaEnforcedProvider(
      new RemoteProvider({ name: row.name, kind: "pollinations", model, apiKey, baseUrl }),
      quota,
    );
  }

  if (kind === "openai_compatible") {
    const apiKey = row.secret_ref ? process.env[row.secret_ref] : undefined;
    const baseUrl = row.base_url;
    if (!apiKey || !baseUrl) return null;
    return new QuotaEnforcedProvider(
      new RemoteProvider({ name: row.name, kind, model: row.model ?? "gpt-4o-mini", apiKey, baseUrl }),
      quota,
    );
  }

  return null;
}

/** Builds a chain where the primary+fallback come from ai_providers rows
 * (configured in the admin AI centre) —the binding is used when the top row
 * references "cloudflare" —and everything falls back to the deterministic
 * grounded floor, so the assistant never fabricates nor dies..
 */
export async function buildDbProviderChain(
  selection: DbProviderSelection,
  deterministicRender: (request: CompletionRequest) => string,
): Promise<ProviderChain> {
  const builtin = new DeterministicProvider(deterministicRender);

  const rows = selection.rows ?? ([] as DbProviderRow[]);
  const enabledRows = rows.filter((r: DbProviderRow) => r.is_enabled).sort((a: DbProviderRow, b: DbProviderRow) => a.priority - b.priority);

  if (enabledRows.length === 0) {
    return { primary: null, fallbacks: [], fallback: builtin };
  }

  for (const row of enabledRows) {
    const provider = await resolveDbProvider(row, { binding: selection.binding });
    if (row.is_fallback && provider) continue;
    if (provider) {
      return { primary: provider, fallbacks: [], fallback: builtin };
    }
  }

  for (const row of enabledRows.filter((r: DbProviderRow) => r.is_fallback)) {
    const provider = await resolveDbProvider(row, { binding: selection.binding });
    if (provider) {
      return { primary: null, fallbacks: [provider], fallback: builtin };
    }
  }

  return { primary: null, fallbacks: [], fallback: builtin };
}

/** Loads the ai_providers rows via the service role (RLS restricts the table to
 * admins; server code is where the app reads config,, never the browser..
 */
export async function loadDbProviders(): Promise<DbProviderRow[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("ai_providers")
      .select(
        "kind,name,model,base_url,secret_ref,is_enabled,is_fallback,priority,monthly_token_quota,max_requests_per_minute,config",
      )
      .order("priority", { ascending: true });
    if (error) return [];
    return (data ?? []).map((r: DbProviderRow) => ({
      ...r,
      is_enabled: r.is_enabled ?? false,
      is_fallback: r.is_fallback ?? false,
    }) as DbProviderRow);
  } catch {
    return [];
  }
}
