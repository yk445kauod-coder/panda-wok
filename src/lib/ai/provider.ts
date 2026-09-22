import "server-only";

import { serverEnv, externalAiConfigured } from "@/lib/config/env";

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

export const REMOTE_PROVIDER_KINDS: readonly AiProviderKind[] = [
  "openrouter",
  "cloudflare",
  "pollinations",
  "gemini",
  "anthropic",
  "openai_compatible",
] as const;

export function isProviderKind(value: string): value is AiProviderKind {
  return (REMOTE_PROVIDER_KINDS as readonly string[]).includes(value);
}

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
  readonly kind: "builtin" | "remote";
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
  apiKey: string;
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
        const apiKey = this.cfg.apiKey;
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
            "x-api-key": this.cfg.apiKey,
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

function buildRemoteFromEnv(kind: AiProviderKind): RemoteProvider | null {
  const apiKey = envBlock(kind, "API_KEY");
  const model = envBlock(kind, "MODEL");
  if (!apiKey || !model) return null;

  const name = (serverEnv as Record<string, string | undefined>)[`AI_${kind.toUpperCase()}_NAME`] ?? kind;
  return new RemoteProvider({
    name,
    kind,
    model,
    apiKey,
    baseUrl: envBlock(kind, "BASE_URL") ?? undefined,
  });
}

/**
 * Builds the provider chain. Order:
 *   1. The env-selected primary (AI_PROVIDER_KIND) if fully configured.
 *   2. The deterministic provider (always available, cannot fail).
 *
 * The env key <<AI_PROVIDER_KIND>> selects the adapter; each adapter reads
 * its own scoped env block first, the generic AI_* block second, so primary
 * and fallback credentials can sit side-by-side:
 *   AI_PROVIDER_KIND=openrouter
 *   AI_OPENROUTER_MODEL=...
 *   AI_OPENROUTER_API_KEY=...
 *   AI_CLOUDFLARE_MODEL=...  (fallback candidate)
 *   AI_CLOUDFLARE_API_KEY=...
 *
 */
export function buildEnvFallbacks(): AiProvider[] {
  const fallbacks: AiProvider[] = [];
  for (const kind of REMOTE_PROVIDER_KINDS) {
    if (kind === serverEnv.AI_PROVIDER_KIND) continue; // primary owns its block.
    const provider = buildRemoteFromEnv(kind);
    if (provider) fallbacks.push(provider);
  }
  return fallbacks;
}

export function buildProviderChain(
  deterministicRender: (request: CompletionRequest) => string,
  options: { fallbacks?: AiProvider[] } = {},
): ProviderChain {
  const builtin = new DeterministicProvider(deterministicRender);
  const fallbacks = options.fallbacks ?? buildEnvFallbacks();

  if (!externalAiConfigured() && fallbacks.length === 0) {
    return { primary: null, fallbacks: [], fallback: builtin };
  }

  let primary: AiProvider | null = null;

  if (externalAiConfigured()) {
    const kindRaw = serverEnv.AI_PROVIDER_KIND ?? "openrouter";
    const kind: AiProviderKind = isProviderKind(kindRaw) ? kindRaw : "openrouter";
    let provider = buildRemoteFromEnv(kind);

    if (!provider && kind === "openai_compatible") {
      const apiKey = envBlock(kind, "API_KEY");
      const model = envBlock(kind, "MODEL");
      if (apiKey && model) {
        provider = new RemoteProvider({
          name: kind,
          kind,
          model,
          apiKey,
          baseUrl: envBlock(kind, "BASE_URL") ?? undefined,
        });
      }
    }

    if (provider) primary = provider;
  }

  if (!primary && fallbacks.length > 0) {
    // No env primary configured, but secondary blocks are — promote the first.
    primary = fallbacks.shift() ?? null;
  }

  return { primary, fallbacks, fallback: builtin };
}

export function resolveDbProvider(
  row: { kind: string; name: string; model: string | null; base_url: string | null; secret_ref: string | null },
): AiProvider | null {
  const kind = row.kind ?? "openai_compatible";
  if (!isProviderKind(kind) || !row.secret_ref) return null;

  const apiKey = process.env[row.secret_ref];
  const model = row.model ?? envBlock(kind, "MODEL");
  if (!apiKey || !model) return null;

  return new RemoteProvider({
    name: row.name,
    kind,
    model,
    apiKey,
    baseUrl: row.base_url ?? undefined,
  });
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
