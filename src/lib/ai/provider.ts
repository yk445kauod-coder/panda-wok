import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  parseToolArguments,
  parseToolTurnOpenAiLike,
  toOpenAiTool,
  type ToolSpec,
} from "@/lib/ai/tool-protocol";
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

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  /**
   * Present on an `assistant` turn that asked for tools: the calls being
   * echoed back to the model, kept so a subsequent request can replay the
   * exact exchange. Optional, so every existing caller is unaffected.
   */
  toolCalls?: { id: string; name: string; arguments: string }[];
};

export type CompletionRequest = {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  /** Tool definitions offered to the model. Ignored by providers without support. */
  tools?: ToolSpec[];
};

/** A tool-using turn. Extends CompletionResult with the calls the model made. */
export type ToolCompletionResult = CompletionResult & {
  toolCalls: { id: string; name: string; arguments: string }[];
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
  /**
   * Whether this provider's wire shape accepts the OpenAI `tools` field.
   *
   * `completeWithTools` alone is not a reliable signal: the method is declared
   * on the shared remote class, so a Gemini provider exposes it and then throws
   * because Gemini speaks a different envelope. Declaring the capability
   * explicitly lets the agent loop choose a provider that will actually work
   * instead of discovering the mismatch one failed call at a time. `undefined`
   * means "not stated" and callers fall back to probing the method.
   */
  readonly toolCapable?: boolean;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /**
   * Completes a request that may call tools. Optional: a provider without
   * native tool support omits it, and the agent loop falls back to parsing a
   * fenced JSON block out of `complete()`'s prose. That keeps every existing
   * provider (including the deterministic floor) usable by the agent.
   */
  completeWithTools?(request: CompletionRequest): Promise<ToolCompletionResult>;
}

/**
 * Whether a provider can drive the agent loop's native tool calling.
 *
 * Prefers the provider's own `toolCapable` declaration and falls back to
 * probing the method for providers that do not state it. The fallback alone is
 * not sufficient — the shared remote class declares `completeWithTools` for
 * every kind, including Gemini, whose call then throws.
 */
export function providerSupportsTools(provider: AiProvider): boolean {
  if (typeof provider.toolCapable === "boolean") return provider.toolCapable;
  return typeof provider.completeWithTools === "function";
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
  /**
   * Wire-level diagnostics for an empty completion. A reasoning model
   * (e.g. OpenRouter's `nvidia/nemotron-...:free`) can spend the whole token
   * budget on hidden reasoning and return `content: null` with
   * `finish_reason: "length"`. Without these two fields that failure is
   * indistinguishable from a genuine provider outage, and the chain silently
   * falls through every reasoning model.
   */
  finishReason?: string | null;
  reasoningTokens?: number | null;
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
/**
 * Unwraps a Cloudflare REST response into the OpenAI-like body that
 * `parseToolTurnOpenAiLike` expects.
 *
 * The REST API nests the chat completion under `result` and also mirrors the
 * tool calls at `result.tool_calls`. Handing the raw envelope to the parser
 * yields zero tool calls and empty text — indistinguishable from a model that
 * chose not to use a tool — so the unwrap has to happen before parsing.
 */
function unwrapCloudflareTurn(raw: unknown): Record<string, unknown> {
  const outer = raw as Record<string, unknown> | null;
  const result = outer?.result;
  const body =
    result && typeof result === "object" ? (result as Record<string, unknown>) : outer ?? {};

  if (Array.isArray(body.choices)) return body;

  // Some models answer through the flat `result.tool_calls` mirror with no
  // `choices` array. Rebuild the OpenAI shape so one parser handles both.
  if (Array.isArray(body.tool_calls)) {
    return {
      choices: [
        {
          message: {
            content: (body.response as string | null) ?? null,
            tool_calls: body.tool_calls,
          },
        },
      ],
      usage: body.usage,
    };
  }
  return body;
}



/**
 * Parses a Gemini `generateContent` reply, including `functionCall` parts.
 *
 * Gemini expresses a tool call as a `functionCall` part rather than the OpenAI
 * `tool_calls` array. Without this the routed primary would answer with a tool
 * *intent* the loop could not see, so the call had to be skipped entirely.
 */
export function parseGeminiTurn(payload: unknown): {
  text: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  promptTokens: number | null;
  completionTokens: number | null;
} {
  const body = payload as {
    candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: unknown } }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  const toolCalls = parts
    .filter((p) => p.functionCall?.name)
    .map((p, index) => ({
      id: `call_${index}`,
      name: p.functionCall!.name as string,
      arguments: JSON.stringify(p.functionCall!.args ?? {}),
    }));
  return {
    text,
    toolCalls,
    promptTokens: body.usageMetadata?.promptTokenCount ?? null,
    completionTokens: body.usageMetadata?.candidatesTokenCount ?? null,
  };
}

/** Maps ToolSpecs into Gemini's `functionDeclarations` shape. */
export function toGeminiTools(tools: { name: string; description: string; parameters: Record<string, unknown> }[]) {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([key, param]) => {
              const p = param as { type?: string; description?: string; enum?: unknown[] };
              return [
                key,
                {
                  type: p.type ?? "string",
                  description: p.description,
                  ...(p.enum ? { enum: p.enum } : {}),
                },
              ];
            }),
          ),
          required: Object.entries(tool.parameters)
            .filter(([, param]) => (param as { required?: boolean }).required)
            .map(([key]) => key),
        },
      })),
    },
  ];
}

/**
 * The message for a provider that answered 200 but with no text. The common
 * cause here is a reasoning model burning the whole `max_tokens` budget on
 * hidden reasoning (`finish_reason: "length"`, `reasoning_tokens` ≈ the
 * budget), which returns `content: null` — a *retryable* condition, not an
 * outage. Naming it in the error is what makes that visible in `ai_requests`
 * instead of looking like every provider is down.
 */
export function emptyCompletionMessage(name: string, parsed: ParsedOk): string {
  const truncated =
    parsed.finishReason === "length" ||
    (parsed.reasoningTokens != null &&
      parsed.completionTokens != null &&
      parsed.reasoningTokens >= parsed.completionTokens);
  const detail = truncated
    ? ` (the model spent its token budget on reasoning: finish_reason=length, reasoning_tokens=${parsed.reasoningTokens ?? "?"})`
    : "";
  return `Provider ${name} returned an empty completion${detail}`;
}

function parseOpenAiLike(text: string): ParsedOk {
  const payload = JSON.parse(text) as {
    choices?: {
      message?: { content?: string };
      finish_reason?: string;
    }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  const choice = payload.choices?.[0];
  const content = choice?.message?.content?.trim() ?? "";
  return {
    text: content,
    promptTokens: payload.usage?.prompt_tokens ?? null,
    completionTokens: payload.usage?.completion_tokens ?? null,
    finishReason: choice?.finish_reason ?? null,
    reasoningTokens: payload.usage?.completion_tokens_details?.reasoning_tokens ?? null,
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
  readonly toolCapable: boolean;

  constructor(private readonly cfg: RemoteProviderConfig) {
    this.name = cfg.name;
    this.model = cfg.model;
    this.toolCapable = TOOL_CAPABLE_KINDS.has(cfg.kind);
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const spec = this.buildSpec(request);
    const parsed = await postJson(spec, this.cfg.timeoutMs ?? 25_000);
    const estimatedCost = estimateCostUsd(this.model, parsed.promptTokens, parsed.completionTokens);

    if (!parsed.text) throw new Error(emptyCompletionMessage(this.name, parsed));

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

  /**
   * Tool-aware completion. Only the OpenAI-shaped kinds support `tools`
   * natively; Gemini and Anthropic use different envelopes, so they are not
   * offered this method and the agent loop falls back to fenced JSON for them.
   *
   * Keep the accepted kinds in step with `TOOL_CAPABLE_KINDS`, which the agent
   * loop consults *before* calling this — a mismatch would silently remove a
   * provider from tool use rather than fail loudly.
   */
  async completeWithTools(request: CompletionRequest): Promise<ToolCompletionResult> {
    if (this.cfg.kind === "gemini") return this.completeWithGeminiTools(request);
    if (!TOOL_CAPABLE_KINDS.has(this.cfg.kind)) {
      throw new Error(`${this.cfg.kind} does not implement native tool calling`);
    }
    const spec = this.buildSpec(request);
    const response = await fetch(spec.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...spec.headers },
      body: JSON.stringify({
        ...spec.body,
        ...(request.tools && request.tools.length > 0
          ? { tools: request.tools.map(toOpenAiTool), tool_choice: "auto" }
          : {}),
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new RemoteRequestFailure(this.name, response.status, detail);
    }
    const rawBody = JSON.parse(await response.text()) as unknown;
    const turn = parseToolTurnOpenAiLike(
      (this.cfg.kind === "cloudflare" ? unwrapCloudflareTurn(rawBody) : rawBody) as never,
    );
    return {
      text: turn.text,
      toolCalls: turn.toolCalls,
      provider: this.name,
      model: this.model,
      promptTokens: turn.promptTokens,
      completionTokens: turn.completionTokens,
      estimatedCost: estimateCostUsd(this.model, turn.promptTokens, turn.completionTokens),
      status: "ok",
    };
  }

  /**
   * Gemini's native tool calling. The wire shape differs from OpenAI's on both
   * sides: tools go in as `functionDeclarations`, and a call comes back as a
   * `functionCall` part rather than a `tool_calls` array.
   *
   * The tool result must be echoed back as a `functionResponse` turn; Gemini
   * rejects a bare text turn as the answer to a function call, which is why the
   * loop's tool messages are translated here instead of reused verbatim.
   */
  private async completeWithGeminiTools(
    request: CompletionRequest,
  ): Promise<ToolCompletionResult> {
    const base = (this.cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const endpoint = `${base}/models/${this.model}:generateContent?key=${encodeURIComponent(this.cfg.apiKey ?? "")}`;

    const system = request.messages.find((m) => m.role === "system")?.content ?? null;
    // The loop already replays tool results as `user` messages containing JSON,
    // and echoes the assistant's calls on `toolCalls`, so both sides map over
    // without a separate `tool` role to translate.
    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (m.role === "assistant" && m.toolCalls?.length) {
          return {
            role: "model",
            parts: m.toolCalls.map((c) => ({
              functionCall: { name: c.name, args: parseToolArguments(c.arguments) },
            })),
          };
        }
        return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
      });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        ...(request.tools?.length ? { tools: toGeminiTools(request.tools as never) } : {}),
        generationConfig: { temperature: request.temperature, maxOutputTokens: request.maxTokens },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new RemoteRequestFailure(this.name, response.status, detail);
    }
    const turn = parseGeminiTurn(JSON.parse(await response.text()));
    return {
      text: turn.text,
      toolCalls: turn.toolCalls,
      provider: this.name,
      model: this.model,
      promptTokens: turn.promptTokens,
      completionTokens: turn.completionTokens,
      estimatedCost: estimateCostUsd(this.model, turn.promptTokens, turn.completionTokens),
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
        // Pollinations' text API is OpenAI-compatible at `/openai` (verified
        // live). The base URL is normalised to that route so a row that stores
        // the bare host still works.
        const root = (base || "https://text.pollinations.ai/openai").replace(/\/+$/, "");
        const endpoint = /\/openai$/.test(root) ? `${root}/chat/completions` : `${root}/openai/chat/completions`;
        return {
          endpoint,
          headers: {
            "content-type": "application/json",
            ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
          },
          body: {
            model: this.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxTokens,
          },
          parse: parseOpenAiLike,
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
    // static generation, so we never use it here
    const { env } = await getCloudflareContext({ async: true });
    // The binding name is fixed ("AI") by wrangler.jsonc — deliberately not
    // configurable, because the app must fail closed (no key, no back-door
    // remote calls) if an operator renames it by accident
    const binding = (env as Record<string, unknown> | undefined)?.["AI"];
    // Truthy check: bindings are objects in prod and in dev proxy; undefined
    // in plain Node builds. A falsy but present value also counts as absent
    return binding ? { ai: binding, envName: "AI" } : null;
  } catch {
    // getCloudflareContext throws outside the Cloudflare platform (e.g. plain
    // `next build` on a Node server only). That is expected and must not break
    // the request — the chain continues without this provider
    return null;
  }
}

/**
 * Requests a text-generation completion from the Workers AI REST binding,
 * mapping the message list onto the model's supported prompt shapes
 *
 * The binding route is `<account>/ai/run/<model>` on the internal API, so it
 * never needs a user-side credential (the Worker's own auth is used). It is
 * therefore usable as the primary provider with zero secrets, and is the only
 * remote provider that the platform enables by default
 */
async function runWorkersAi(
  ai: { run(model: string, body: Record<string, unknown>): Promise<unknown> },
  model: string,
  request: CompletionRequest,
): Promise<{ text: string; promptTokens: number | null; completionTokens: number | null }> {
  const { system, turns } = splitSystem(request);

  // Llama-family models accept the OpenAI chat shape via "messages"; most
  // Workers AI text models do too.The body mirrors what the REST /ai/run
  // endpoint accepts, so the binding implements the same contract

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
    // provider has no database row yet
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

  /**
   * Workers AI accepts the OpenAI `tools` shape for its instruct models. A
   * model that ignores the field simply answers in prose, which the loop
   * handles (zero tool calls in the turn).
   */
  async completeWithTools(request: CompletionRequest): Promise<ToolCompletionResult> {
    const { system, turns } = splitSystem(request);
    let result: unknown;
    try {
      result = await this.ai.run(this.model, {
        messages: turns,
        ...(system ? { system } : {}),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        ...(request.tools && request.tools.length > 0
          ? { tools: request.tools.map(toOpenAiTool), tool_choice: "auto" }
          : {}),
      });
    } catch (error) {
      throw new Error(
        error instanceof Error ? `Workers AI: ${error.message}` : "Workers AI request failed",
      );
    }
    const turn = parseToolTurnOpenAiLike(JSON.parse(JSON.stringify(result ?? {})) as never);
    return {
      text: turn.text,
      toolCalls: turn.toolCalls,
      provider: this.name,
      model: this.model,
      promptTokens: turn.promptTokens,
      completionTokens: turn.completionTokens,
      estimatedCost: null,
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

/**
 * Resolves the API key a provider row references. The value lives either in
 * Supabase Vault (set from the admin AI centre) or in the server environment
 * (deploy-time config). Vault is checked first so an operator can rotate a key
 * from the console without a redeploy; the environment remains a valid fallback
 * for keys provisioned at deploy time. Never returns anything to the client.
 */
export async function resolveSecretValue(secretRef: string): Promise<string | undefined> {
  return resolveSecretValueWithEnv(secretRef, serverEnv);
}

/**
 * Same resolution, but against an explicit environment object. Needed because
 * `serverEnv` is a *validated* subset: it does not carry the Workers AI account
 * id/token pair (`AI_CLOUDFLARE_ACCOUNT_ID` / `AI_CLOUDFLARE_API_TOKEN`), which
 * are not in the schema but may be set in the runtime env. Reading `process.env`
 * directly is what lets the embeddings path authenticate outside a Worker.
 */
export async function resolveSecretValueWithEnv(
  secretRef: string,
  env: Record<string, string | undefined>,
): Promise<string | undefined> {
  const fromEnv = env[secretRef];
  if (fromEnv) return fromEnv;

  const admin = tryCreateAdminSupabase();
  if (!admin) return undefined;
  try {
    const { data, error } = await admin.rpc("get_ai_secret", { p_name: secretRef });
    if (error || !data) return undefined;
    return typeof data === "string" && data.length > 0 ? data : undefined;
  } catch {
    return undefined;
  }
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
  /**
   * Task-based routing: `{ task -> priority }`. A provider is eligible for
   * every task; for a task present here its priority is the map value instead
   * of the base `priority` (lower runs first). A task absent from the map uses
   * the base priority, and an empty map means "eligible everywhere at the base
   * priority" — the pre-routing single-chain behaviour.
   */
  routes?: Record<string, number> | null;
  config?: unknown;
};

/**
 * The workloads the provider chain can be routed for. Kept in sync with the
 * task vocabulary in `20260929210000_ai_task_routing.sql`; callers pass one of
 * these to `buildDbProviderChain`.
 *
 *  - chat    customer assistant + operator chat: short, tool-light.
 *  - ops     scheduled ops agent: recurring daily/weekly reports.
 *  - agentic multi-step operator agent: tool loops and document generation.
 */
export const AI_TASKS = ["chat", "ops", "agentic"] as const;
export type AiTask = (typeof AI_TASKS)[number];

/**
 * The priority a provider runs at for a task. A task keyed in `routes` uses the
 * map value; otherwise the base `priority`. Exported so the admin console and
 * the tests share the exact rule the runtime uses.
 */
export function routePriority(row: Pick<DbProviderRow, "priority" | "routes">, task: AiTask): number {
  const mapped = row.routes?.[task];
  return typeof mapped === "number" && Number.isFinite(mapped) ? mapped : row.priority;
}

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
    // via a separate aggregate query because the head:true form cannot sum
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
    // service key missing) we treat usage as zero and let requests proceed
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
  readonly toolCapable: boolean;
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
    this.toolCapable = providerSupportsTools(inner);
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const floor = await this.quotaFloor();
    if (floor) return floor;
    return this.inner.complete(request);
  }

  /**
   * Tool-aware completion, delegated to the wrapped provider.
   *
   * This must be declared whenever the inner provider supports it. The agent
   * loop probes the *wrapper* for this method, so omitting it made every
   * provider look incapable of tool calling and the loop never executed a
   * single tool — it degraded to prose the model invented. Quota enforcement
   * still applies, answered by the deterministic floor instead of the model.
   */
  async completeWithTools(request: CompletionRequest): Promise<ToolCompletionResult> {
    if (!this.inner.completeWithTools) {
      throw new Error(`${this.name} does not implement native tool calling`);
    }
    const floor = await this.quotaFloor();
    if (floor) return { ...floor, toolCalls: [] };
    return this.inner.completeWithTools(request);
  }

  /** Returns the deterministic floor result when a quota is exhausted, else null. */
  private async quotaFloor(): Promise<CompletionResult | null> {
    const usage = await getAiProviderUsage({ name: this.inner.name, kind: this.inner.kind });
    const minuteLimit = Math.max(1, this.opts.maxRequestsPerMinute);
    if (usage.minuteRequests >= minuteLimit ||
      (this.opts.monthlyTokenQuota !== null &&
        usage.monthUsedTokens >= this.opts.monthlyTokenQuota)) {
      // Quota exhausted: the caller records the outcome via the normal usage
      // ledger; here we degrade to the deterministic floor instead of erroring
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
    return null;
  }
}

export type AiRunResult = CompletionResult & {
  latencyMs: number;
  error: string | null;
};

/**
 * Runs the chain and reports the outcome. Every provider is tried in order —
 * primary, then each fallback, then the deterministic floor — so one provider
 * being down, rate-limited or over quota never surfaces to the customer as an
 * error. Failures are collected into the returned `error` for the usage ledger
 * but never thrown.
 */
export async function runCompletion(
  chain: ProviderChain,
  request: CompletionRequest,
): Promise<AiRunResult> {
  const started = Date.now();
  const attempts: AiProvider[] = [
    ...(chain.primary ? [chain.primary] : []),
    ...chain.fallbacks,
  ];

  const failures: string[] = [];
  for (const provider of attempts) {
    try {
      const result = await provider.complete(request);
      return {
        ...result,
        latencyMs: Date.now() - started,
        // Keep a trace of what went wrong earlier, without failing the answer.
        error: failures.length > 0 ? failures.join(" | ") : null,
      };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "provider failed");
    }
  }

  // Nothing remote answered — answer deterministically, which is always correct
  // and grounded, and report why in `error`.
  const result = await chain.fallback.complete(request);
  return {
    ...result,
    latencyMs: Date.now() - started,
    error: failures.length > 0 ? failures.join(" | ") : null,
  };
}

/* ------------------------------------------------------------------ */
/* Database-driven providers (admin AI centre)                         */
/* ------------------------------------------------------------------ */

/** All provider kinds the admin may configure. Each maps to a wire shape in
 * `RemoteProvider.buildSpec`, plus the keyless Workers AI binding.
 */
export const DB_PROVIDER_KINDS = [
  "cloudflare",
  "pollinations",
  "openrouter",
  "gemini",
  "openai_compatible",
] as const;

/**
 * Default model per remote kind, used when a row leaves `model` unset. These are
 * free-tier models on purpose — the assistant's chain is meant to cost nothing.
 * Verified live against each provider's model list on 2026-09-27; the earlier
 * `gemini-2.0-flash` and `meta-llama/llama-3.3-70b-instruct:free` defaults had
 * been retired and returned 404 / were absent, so they were replaced.
 */
const DEFAULT_MODEL_BY_KIND: Record<string, string> = {
  openrouter: "nvidia/nemotron-3-super-120b-a12b:free",
  gemini: "gemini-2.5-flash",
  pollinations: "openai",
  openai_compatible: "gpt-4o-mini",
};

/**
 * Default base URL per remote kind. Pollinations' text API is OpenAI-compatible
 * at `/openai`, so it rides the OpenAI wire shape rather than its own.
 */
const DEFAULT_BASE_URL_BY_KIND: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  pollinations: "https://text.pollinations.ai/openai",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

/** Kinds that cannot work without a credential. Every other kind may run on a
 * public endpoint (pollinations) or the Worker's own binding (cloudflare). */
const REQUIRES_KEY = new Set<string>(["openrouter", "gemini", "openai_compatible"]);

/** Kinds whose wire shape accepts tool definitions, so a provider of this kind
 * can drive the agent loop's native tool calling. Gemini speaks a different
 * envelope (`functionDeclarations` / `functionCall`) and is handled by
 * `completeWithGeminiTools` rather than the OpenAI path. */
export const TOOL_CAPABLE_KINDS: ReadonlySet<string> = new Set([
  "openrouter",
  "openai_compatible",
  "pollinations",
  "cloudflare",
  "gemini",
]);

/** Vault secret names the Cloudflare REST fallback reads by default. The keyless
 * binding needs neither; these exist so Workers AI still works in an environment
 * with no binding (e.g. plain local dev). */
const CF_ACCOUNT_SECRET = "AI_CLOUDFLARE_ACCOUNT_ID";
const CF_TOKEN_SECRET = "AI_CLOUDFLARE_API_TOKEN";

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
 * enforced per-provider by the ai_requests ledger (admin-editable numbers)
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
    // Preferred: the keyless Workers AI binding, which uses the Worker's own
    // auth and needs no credential.
    const binding = opts.binding ?? (await getWorkersAiBinding());
    if (binding && typeof binding.ai === "object" && binding.ai !== null) {
      return new QuotaEnforcedProvider(
        new CloudflareBindingProvider(binding.ai as never, {
          model: row.model ?? null,
          name: row.name,
          envName: binding.envName,
        }),
        quota,
      );
    }

    // Fallback: the same models over the REST API, which needs an account id and
    // an API token. This is what makes Workers AI usable in plain `next dev`.
    const accountId = await resolveSecretValue(CF_ACCOUNT_SECRET);
    const apiToken = row.secret_ref
      ? await resolveSecretValue(row.secret_ref)
      : await resolveSecretValue(CF_TOKEN_SECRET);
    const model = row.model ?? envBlock("cloudflare", "MODEL") ?? CF_BINDING_DEFAULT_MODEL;
    if (!accountId || !apiToken || !model) return null;

    return new QuotaEnforcedProvider(
      new RemoteProvider({
        name: row.name,
        kind: "cloudflare",
        model,
        apiKey: apiToken,
        baseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}`,
      }),
      quota,
    );
  }

  // Every remaining kind is a plain HTTP provider. The wire shape is chosen by
  // `kind`; base URL and model fall back to the kind's free-tier defaults, and
  // the key is resolved from Vault (or the server env) via `secret_ref`.
  if (DB_PROVIDER_KINDS.includes(kind as never)) {
    const apiKey = row.secret_ref ? await resolveSecretValue(row.secret_ref) : undefined;
    if (REQUIRES_KEY.has(kind) && !apiKey) return null;

    const baseUrl =
      row.base_url ??
      envBlock(kind as AiProviderKind, "BASE_URL") ??
      DEFAULT_BASE_URL_BY_KIND[kind] ??
      null;
    const model =
      row.model ?? envBlock(kind as AiProviderKind, "MODEL") ?? DEFAULT_MODEL_BY_KIND[kind];
    if (!model) return null;

    return new QuotaEnforcedProvider(
      new RemoteProvider({
        name: row.name,
        kind: kind as AiProviderKind,
        model,
        apiKey,
        baseUrl: baseUrl ?? undefined,
      }),
      quota,
    );
  }

  return null;
}

/**
 * Builds the ordered provider chain from the `ai_providers` rows configured in
 * the admin AI centre, for one task (see `AiTask`).
 *
 * Priority order is the contract: for the given task, the lowest-priority
 * enabled row that resolves to a working provider is the primary, and every
 * other enabled row becomes an ordered fallback tried before the deterministic
 * floor. A row's priority for a task is `routePriority(row, task)` — the
 * `routes` map value when the task is keyed there, else the base `priority`.
 * `is_fallback` marks a row that may only ever answer when no non-fallback
 * provider resolved, so a "last resort" row is never chosen as the primary
 * while a real one exists.
 *
 * Routing means a provider missing its key for this task simply drops out and
 * the next routed row takes over, so a task with no configured provider still
 * lands on the shared providers and then the deterministic floor. An outage, an
 * exhausted quota or a missing key degrades into a correct, database-grounded
 * answer rather than an error.
 */
export async function buildDbProviderChain(
  selection: DbProviderSelection,
  deterministicRender: (request: CompletionRequest) => string,
  task: AiTask = "chat",
): Promise<ProviderChain> {
  const builtin = new DeterministicProvider(deterministicRender);

  const rows = selection.rows ?? ([] as DbProviderRow[]);
  const enabledRows = rows
    .filter((r: DbProviderRow) => r.is_enabled)
    .sort(
      (a: DbProviderRow, b: DbProviderRow) =>
        routePriority(a, task) - routePriority(b, task) || a.priority - b.priority,
    );

  if (enabledRows.length === 0) {
    return { primary: null, fallbacks: [], fallback: builtin };
  }

  // Resolve in priority order, keeping every provider that is actually usable.
  // A row can fail to resolve (e.g. a cloudflare row with no Workers AI binding
  // in this environment, or an openai_compatible row with no key); those are
  // skipped rather than truncating the chain.
  const resolved: { provider: AiProvider; isFallbackOnly: boolean }[] = [];
  for (const row of enabledRows) {
    const provider = await resolveDbProvider(row, { binding: selection.binding });
    if (provider) resolved.push({ provider, isFallbackOnly: row.is_fallback === true });
  }

  const real = resolved.filter((r) => !r.isFallbackOnly);
  const lastResort = resolved.filter((r) => r.isFallbackOnly);

  if (real.length > 0) {
    const [primary, ...rest] = real;
    return {
      primary: primary.provider,
      fallbacks: [...rest.map((r) => r.provider), ...lastResort.map((r) => r.provider)],
      fallback: builtin,
    };
  }

  if (lastResort.length > 0) {
    return { primary: null, fallbacks: lastResort.map((r) => r.provider), fallback: builtin };
  }

  return { primary: null, fallbacks: [], fallback: builtin };
}

/** Loads the ai_providers rows via the service role (RLS restricts the table to
 * admins; server code is where the app reads config, never the browser
 */
export async function loadDbProviders(): Promise<DbProviderRow[]> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("ai_providers")
      .select(
        "kind,name,model,base_url,secret_ref,is_enabled,is_fallback,priority,monthly_token_quota,max_requests_per_minute,routes,config",
      )
      .order("priority", { ascending: true });
    if (error) return [];
    return (data ?? []).map((raw) => {
      const r = raw as unknown as DbProviderRow;
      return {
        ...r,
        is_enabled: r.is_enabled ?? false,
        is_fallback: r.is_fallback ?? false,
        // Normalise a null/garbage map to {} so routePriority always has an object.
        routes:
          r.routes && typeof r.routes === "object" && !Array.isArray(r.routes)
            ? (r.routes as Record<string, number>)
            : {},
      } as DbProviderRow;
    });
  } catch {
    return [];
  }
}
