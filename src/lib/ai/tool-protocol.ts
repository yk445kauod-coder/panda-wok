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

/**
 * Extracts a balanced `{...}` / `[...]` region starting at `start`, ignoring
 * braces inside string literals. Returns null when the region never closes.
 */
function extractBalanced(text: string, start: number, open: string, close: string): string | null {
  if (text[start] !== open) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

type SalvagedSpan = { start: number; end: number; name: string; args: string };

/** Every `{...}` whose JSON names an allowed tool, in any common alias shape. */
function findJsonNameSpans(text: string, allowed: ReadonlySet<string>): SalvagedSpan[] {
  const spans: SalvagedSpan[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "{") continue;
    const raw = extractBalanced(text, i, "{", "}");
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const obj = parsed as Record<string, unknown>;
    const name = [obj.name, obj.tool, obj.function, obj.tool_name].find(
      (v): v is string => typeof v === "string" && allowed.has(v),
    );
    if (!name) continue;
    const args = obj.arguments ?? obj.args ?? obj.parameters ?? {};
    spans.push({
      start: i,
      end: i + raw.length,
      name,
      args: typeof args === "string" ? args : JSON.stringify(args),
    });
  }
  return spans;
}

/** `[tool_name, {...}]` / `[tool_name {...}]` — a common weak-model shape. */
function findBracketSpans(text: string, allowed: ReadonlySet<string>): SalvagedSpan[] {
  const spans: SalvagedSpan[] = [];
  const re = /\[\s*([A-Za-z_][\w]*)\s*[,(]?\s*(?=\{)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = match[1];
    if (!allowed.has(name)) continue;
    const braceStart = match.index + match[0].length;
    const raw = extractBalanced(text, braceStart, "{", "}");
    if (!raw) continue;
    const closeBracket = text.indexOf("]", braceStart + raw.length);
    spans.push({
      start: match.index,
      end: closeBracket === braceStart + raw.length ? closeBracket + 1 : braceStart + raw.length,
      name,
      args: raw,
    });
  }
  // A no-argument call, e.g. `[menu_summary]` or `[menu_summary()]`. The shapes
  // above all require a `{...}` body, so without this a tool that takes no
  // arguments was never recovered.
  const bare = /\[\s*([A-Za-z_][\w]*)\s*(?:\(\s*\))?\s*\]/g;
  while ((match = bare.exec(text)) !== null) {
    const name = match[1];
    if (!allowed.has(name)) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, name, args: "{}" });
  }
  return spans;
}

/** `tool_name({...})` / `tool_name()` — a call written as prose. */
function findParenSpans(text: string, allowed: ReadonlySet<string>): SalvagedSpan[] {
  const spans: SalvagedSpan[] = [];
  const re = /\b([A-Za-z_][\w]*)\s*\(\s*(?=\{)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = match[1];
    if (!allowed.has(name)) continue;
    const braceStart = match.index + match[0].length;
    const raw = extractBalanced(text, braceStart, "{", "}");
    if (!raw) continue;
    const closeParen = text.indexOf(")", braceStart + raw.length);
    spans.push({
      start: match.index,
      end: closeParen === braceStart + raw.length ? closeParen + 1 : braceStart + raw.length,
      name,
      args: raw,
    });
  }
  // A no-argument call: `menu_summary()`. Same reasoning as the bracket form.
  const bare = /\b([A-Za-z_][\w]*)\s*\(\s*\)/g;
  while ((match = bare.exec(text)) !== null) {
    const name = match[1];
    if (!allowed.has(name)) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, name, args: "{}" });
  }
  return spans;
}

/**
 * Recovers tool calls a model wrote as *text* instead of a structured call.
 *
 * Weaker free models routinely emit `[remember_memory, {"content": "…"}]` or a
 * fenced `{"name": …, "arguments": …}` block. The provider returns no
 * `tool_calls`, so without this the call is silently dropped: the loop sees an
 * empty turn, the tool never runs, and the operator is told "nothing happened"
 * for a request the model did handle. That is a silent failure of the worst kind
 * — it looks like the feature is not implemented.
 *
 * Deliberately conservative: only names already offered in this turn are
 * matched, and the JSON must parse. Anything else is left in the prose, so a
 * false positive cannot invent a call the model did not make.
 */
export function salvageToolCalls(
  text: string,
  allowed: readonly string[],
): { text: string; toolCalls: ToolCall[] } {
  const names = new Set(allowed);
  if (names.size === 0 || !text) return { text, toolCalls: [] };

  const found = [
    ...findJsonNameSpans(text, names),
    ...findBracketSpans(text, names),
    ...findParenSpans(text, names),
  ].sort((a, b) => a.start - b.start);

  // Keep the first of any overlapping matches, so one call is not double-counted.
  const chosen: SalvagedSpan[] = [];
  let cursor = -1;
  for (const span of found) {
    if (span.start < cursor) continue;
    chosen.push(span);
    cursor = span.end;
  }
  if (chosen.length === 0) return { text, toolCalls: [] };

  let remaining = "";
  let last = 0;
  for (const span of chosen) {
    remaining += text.slice(last, span.start);
    last = span.end;
  }
  remaining += text.slice(last);

  return {
    text: remaining.trim(),
    toolCalls: chosen.map((span, index) => ({
      id: `salvaged_${index}`,
      name: span.name,
      arguments: span.args,
    })),
  };
}
