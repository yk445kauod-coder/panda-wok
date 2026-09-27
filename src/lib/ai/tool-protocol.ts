/**
 * Tool-calling protocol, shared by every provider adapter.
 *
 * The wire format is deliberately OpenAI-shaped (`tools` + `tool_calls`), which
 * is the de-facto standard: OpenRouter, OpenAI-compatible endpoints, the
 * Workers AI binding and Gemini's `functionDeclarations` all accept or can be
 * mapped from it. Providers that cannot do tool calling (the deterministic
 * floor) simply ignore `tools` and answer in prose.
 *
 * The protocol lives in its own module so `provider.ts` stays about transport
 * and the agent loop stays about planning — neither has to own the other's
 * shape.
 */

/** A parameter the model may supply when calling a tool. */
export type ToolParameter = {
  type: "string" | "number" | "boolean" | "integer";
  description: string;
  /** Allowed values, when the argument is a closed set. */
  enum?: string[];
  required?: boolean;
};

/**
 * A tool offered to the model. `name` is what the model emits in a tool call;
 * `parameters` becomes the JSON schema the model reads. `write` marks a tool
 * that mutates state — the loop gates those behind explicit confirmation.
 */
export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  write?: boolean;
};

/** One tool invocation the model asked for, normalised across wire formats. */
export type ToolCall = {
  /** Provider-assigned id, echoed back with the result. */
  id: string;
  name: string;
  /** Raw JSON string exactly as the model produced it. */
  arguments: string;
};

/** The model's reply for one turn: either prose, or one or more tool calls. */
export type ToolTurn = {
  text: string;
  toolCalls: ToolCall[];
  promptTokens: number | null;
  completionTokens: number | null;
  provider: string;
  model: string;
};

/** The result of executing a tool, fed back to the model as a tool message. */
export type ToolResult = {
  callId: string;
  name: string;
  /** `ok` when the tool ran; `error` when it refused or failed. */
  status: "ok" | "error";
  /** JSON-serialisable payload the model reads. */
  data: unknown;
  /** Human summary for the UI transcript. */
  summary: string;
};

/** OpenAI-style function definition derived from a ToolSpec. */
export function toOpenAiTool(spec: ToolSpec) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, param] of Object.entries(spec.parameters)) {
    properties[name] = {
      type: param.type,
      description: param.description,
      ...(param.enum ? { enum: param.enum } : {}),
    };
    if (param.required) required.push(name);
  }
  return {
    type: "function" as const,
    function: {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: "object" as const,
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

/**
 * Parses an OpenAI-shaped reply into a ToolTurn. Used by every adapter that
 * speaks `choices[].message`, which is all of them except Gemini.
 */
export function parseToolTurnOpenAiLike(payload: {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): Omit<ToolTurn, "provider" | "model"> {
  const message = payload.choices?.[0]?.message;
  const toolCalls: ToolCall[] = (message?.tool_calls ?? [])
    .filter((c) => c.function?.name)
    .map((c, index) => ({
      id: c.id ?? `call_${index}`,
      name: c.function?.name as string,
      arguments: c.function?.arguments ?? "{}",
    }));
  return {
    text: (message?.content ?? "").trim(),
    toolCalls,
    promptTokens: payload.usage?.prompt_tokens ?? null,
    completionTokens: payload.usage?.completion_tokens ?? null,
  };
}

/** Safely reads a tool call's arguments as an object. Never throws. */
export function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}
