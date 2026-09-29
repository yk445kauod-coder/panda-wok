import "server-only";

import type { Capability } from "@/lib/auth/rbac";
import {
  buildDbProviderChain,
  loadDbProviders,
  providerSupportsTools,
  type AiProvider,
  type ChatMessage,
  type ProviderChain,
} from "@/lib/ai/provider";
import {
  parseToolArguments,
  type ToolResult,
  type ToolSpec,
} from "@/lib/ai/tool-protocol";
import { AGENT_TOOLS, toolsForCapabilities } from "@/lib/agent/registry";
import { callMcpTool, discoverMcpTools } from "@/lib/agent/mcp";
import { recall, renderMemoryContext } from "@/lib/agent/memory";
import { retrieveSkills, renderSkillContext } from "@/lib/agent/skills";
import { FABRICATION_NOTICE, findUngroundedFigures } from "@/lib/agent/grounding";

/**
 * The conversational agent loop.
 *
 * One call to `runAgentTurn` executes as many model→tool→model rounds as the
 * model needs (bounded by `maxSteps`), then returns a final answer plus the
 * transcript of everything that ran. That transcript is what makes the feature
 * honest: the operator sees each tool call and its result, not a model's
 * summary of what it claims to have done.
 *
 * Two safety properties are structural, not prompt-based:
 *
 *  1. The tool list is filtered by the actor's capabilities *before* the model
 *     sees it, so a support agent is never offered `set_menu_item_price`.
 *  2. Write tools are marked `write: true`. When `confirmWrites` is true (the
 *     default) a write call is not executed; it is recorded as needing approval
 *     and the model is told so. Auto-apply is an explicit opt-in per turn.
 *
 * The deterministic floor keeps the agent answering when no model is
 * configured: with no provider it returns the tool observations as a readable
 * summary rather than failing.
 */

export type AgentStep = {
  /** The tool the model asked for. */
  tool: string;
  arguments: Record<string, unknown>;
  status: "ok" | "error" | "pending_approval";
  summary: string;
  data?: unknown;
};

export type AgentTurnResult = {
  answer: string;
  steps: AgentStep[];
  provider: string;
  model: string;
  /** True when the deterministic floor answered (no model was reachable). */
  fallback: boolean;
  /** Write calls the model proposed that await a human decision. */
  pendingApproval: AgentStep[];
};

export type AgentTurnInput = {
  question: string;
  history?: ChatMessage[];
  capabilities: readonly Capability[];
  actorName?: string;
  /** When true (default), write tools are queued for approval, not executed. */
  confirmWrites?: boolean;
  /** Hard ceiling on model→tool rounds, so a looping model cannot run forever. */
  maxSteps?: number;
};

const SYSTEM_PROMPT = `You are the Panda Wok operations agent, embedded in the staff console.

You help staff run a restaurant: you can read live business data and propose or
perform operational actions.

LANGUAGE — this matters:
- Your default and preferred language is Egyptian Arabic (العامية المصرية). Write
  numbers and dish names naturally, the way a Cairo restaurant manager speaks.
- If the staff member writes in English, answer in English; otherwise answer in
  Egyptian Arabic. Match their language, never mix two languages in one reply.

HONESTY — this is the rule you must never break:
- You have no knowledge of Panda Wok's numbers. Every figure you state — revenue,
  order counts, prices, stock, customers — MUST come from a tool result in this
  conversation. If you did not call a tool, you do not know the number.
- NEVER estimate, round, extrapolate, or invent a figure. "I don't have that
  number yet" is always the correct answer over a guessed one.
- If a tool returns an error or no rows, say exactly that. An empty result is a
  fact about the business ("مفيش أوردرات مكتملة في الفترة دي"), not a reason to
  fill the gap with a plausible number.
- If a tool failed, do not answer the question from memory — report the failure
  and, if useful, suggest a tool that might work.
- Distinguish clearly between a real value ("0 ج.م") and unavailable data ("مش
  قادر أوصل للبيانات دلوقتي").
- Never present a proposal as something that already happened. A write call that
  is pending approval is pending, not done.

STYLE:
- Prefer calling a tool over describing what a tool could do.
- Be brief. Staff read this during service. Lead with the answer, then the number
  and where it came from.`;

const NO_MODEL_MESSAGE =
  "مش قادر أوصل لموديل ذكاء اصطناعي دلوقتي، فمقدرش أجاوب من غير بيانات. " +
  "بس أقدر أوريك اللي الأدوات رجّعته بالظبط تحت.";

/** Providers that can call tools natively; otherwise the model gets no tools. */
function supportsTools(provider: AiProvider): boolean {
  return providerSupportsTools(provider);
}

/**
 * Picks the provider that should run the tool loop.
 *
 * The chain is ordered by the owner's routing, which may put a provider first
 * that cannot do native tool calling (Gemini speaks a different envelope). This
 * prefers the first tool-capable provider in the chain so the loop gets real
 * tools, and only falls back to the routed primary when nothing in the chain
 * can call tools — in which case `nextTurn` sends no tools and the answer is
 * honest prose rather than a fabricated one.
 */
export function selectToolProvider(chain: ProviderChain): AiProvider {
  const ordered = [chain.primary, ...chain.fallbacks].filter(
    (p): p is AiProvider => p !== null,
  );
  return ordered.find((p) => supportsTools(p)) ?? chain.primary ?? chain.fallbacks[0] ?? chain.fallback;
}

/**
 * Asks the model for the next turn. When the provider cannot call tools, the
 * request goes out as plain prose and the turn has zero tool calls — the loop
 * then finishes honestly with whatever the model said, and the caller can tell
 * from `provider` that no tool ran.
 */
async function nextTurn(
  provider: AiProvider,
  messages: ChatMessage[],
  tools: ToolSpec[],
  opts: { temperature: number; maxTokens: number },
): Promise<{
  text: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  provider: string;
  model: string;
}> {
  if (supportsTools(provider) && tools.length > 0) {
    const result = await provider.completeWithTools!({
      messages,
      tools,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
    return {
      text: result.text,
      toolCalls: result.toolCalls,
      provider: result.provider,
      model: result.model,
    };
  }
  const result = await provider.complete({
    messages,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
  return { text: result.text, toolCalls: [], provider: result.provider, model: result.model };
}

/**
 * Runs a full agent turn. The returned `steps` are in execution order so the UI
 * can render a real activity log beside the answer.
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const maxSteps = Math.min(Math.max(input.maxSteps ?? 6, 1), 12);
  const confirmWrites = input.confirmWrites ?? true;

  const available = toolsForCapabilities(input.capabilities);

  // External MCP tools are additive: they extend the built-in registry when a
  // server is configured. Discovery failures are already swallowed per-server,
  // so a broken endpoint never removes the built-ins.
  const mcpTools = input.capabilities.includes("ai.manage")
    ? await discoverMcpTools().catch(() => [])
    : [];
  const tools: ToolSpec[] = [...available.map((t) => t.spec), ...mcpTools.map((m) => m.spec)];

  // Cheap, relevant context: a couple of owner memories plus matching skill
  // chunks. Never a full dump — the agent's context is a budget, not a bucket.
  const [memories, skillChunks] = await Promise.all([
    recall({ query: input.question, scope: "owner", matchCount: 3 }).catch(() => []),
    retrieveSkills(input.question, 4).catch(() => []),
  ]);

  const contextBlocks = [
    renderMemoryContext(memories),
    renderSkillContext(skillChunks),
    input.actorName ? `Acting as: ${input.actorName}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(contextBlocks ? [{ role: "system" as const, content: contextBlocks }] : []),
    ...(input.history ?? []),
    { role: "user", content: input.question },
  ];

  // The operator agent is the "agentic" workload: multi-step tool loops and
  // document work, so it is routed to the strongest free model the owner keys.
  const chain = await buildDbProviderChain({ rows: await loadDbProviders(), binding: null }, () =>
    // The deterministic floor answers with an honest "I have no model" line;
    // the loop below still runs so the transcript shows the attempt.
    NO_MODEL_MESSAGE,
    "agentic",
  );
  // The routed primary may be unable to call tools, so pick the first provider
  // that can. Everything else in the chain stays reachable as a fallback.
  const provider = selectToolProvider(chain);
  const retryProviders = [chain.primary, ...chain.fallbacks].filter(
    (p): p is AiProvider => p !== null && p !== provider,
  );

  const steps: AgentStep[] = [];
  // Every payload a tool returned, kept so the final answer can be checked
  // against it. Only `ok` results count — an error carries no numbers to ground
  // against, which is exactly why an answer must not be built from one.
  const observations: unknown[] = [];
  let providerError: string | null = null;
  let active = provider;

  for (let step = 0; step < maxSteps; step += 1) {
    let turn: Awaited<ReturnType<typeof nextTurn>>;
    try {
      turn = await nextTurn(active, messages, tools, { temperature: 0.3, maxTokens: 900 });
    } catch (error) {
      // A provider hiccup mid-loop must not discard the work already done. Walk
      // the remaining providers once — a chain whose primary cannot do tool
      // calling (or is down) still gets a usable answer from the next one —
      // and only then stop, recording the failure so the answer can say the
      // model was unreachable rather than imply the data was empty.
      const next = retryProviders.shift();
      if (next) {
        providerError = error instanceof Error ? error.message : "model call failed";
        active = next;
        continue;
      }
      providerError = error instanceof Error ? error.message : "model call failed";
      break;
    }
    // The call succeeded, so any earlier failure was recovered by the fallback.
    // Leaving it set would make a good answer render the "no model" notice.
    providerError = null;

    if (turn.toolCalls.length === 0) {
      return {
        answer: finaliseAnswer(turn.text, steps, observations, providerError),
        steps,
        provider: turn.provider,
        model: turn.model,
        fallback: turn.provider === "deterministic",
        pendingApproval: steps.filter((s) => s.status === "pending_approval"),
      };
    }

    // Echo the assistant's tool request back so the follow-up call is valid.
    messages.push({
      role: "assistant",
      content: turn.text,
      toolCalls: turn.toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })),
    });

    for (const call of turn.toolCalls) {
      const def = AGENT_TOOLS[call.name];
      const args = parseToolArguments(call.arguments);

      // MCP tools are namespaced `mcp__<server>__<tool>`; route them to the
      // server that advertised them rather than the built-in registry.
      if (!def && call.name.startsWith("mcp__")) {
        const match = mcpTools.find((m) => m.spec.name === call.name);
        if (!match) {
          steps.push({ tool: call.name, arguments: args, status: "error", summary: "unknown MCP tool" });
          continue;
        }
        if (confirmWrites) {
          const summary = `awaiting approval: ${match.spec.description}`;
          steps.push({ tool: call.name, arguments: args, status: "pending_approval", summary });
          messages.push(
            toolMessage({
              callId: call.id,
              name: call.name,
              status: "ok",
              data: { pending_approval: true, note: "Queued for a human to approve." },
              summary,
            }),
          );
          continue;
        }
        try {
          const data = await callMcpTool(match.server, match.tool.name, args);
          steps.push({ tool: call.name, arguments: args, status: "ok", summary: `called ${match.tool.name}`, data });
          observations.push({ [match.tool.name]: data });
          messages.push(
            toolMessage({
              callId: call.id,
              name: call.name,
              status: "ok",
              data,
              summary: `called ${match.tool.name}`,
            }),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "MCP call failed";
          steps.push({ tool: call.name, arguments: args, status: "error", summary: message });
          messages.push(toolMessage({ callId: call.id, name: call.name, status: "error", data: { error: message }, summary: message }));
        }
        continue;
      }

      if (!def || !input.capabilities.includes(def.capability)) {
        const result: ToolResult = {
          callId: call.id,
          name: call.name,
          status: "error",
          data: { error: "tool not permitted for this actor" },
          summary: `${call.name} not permitted`,
        };
        steps.push({ tool: call.name, arguments: args, status: "error", summary: result.summary });
        messages.push(toolMessage(result));
        continue;
      }

      if (def.mode === "write" && confirmWrites) {
        const summary = `awaiting approval: ${def.spec.description}`;
        steps.push({ tool: call.name, arguments: args, status: "pending_approval", summary });
        messages.push(
          toolMessage({
            callId: call.id,
            name: call.name,
            status: "ok",
            data: { pending_approval: true, note: "Queued for a human to approve." },
            summary,
          }),
        );
        continue;
      }

      try {
        const outcome = await def.run(args);
        steps.push({
          tool: call.name,
          arguments: args,
          status: "ok",
          summary: outcome.summary,
          data: outcome.data,
        });
        observations.push(outcome.data);
        messages.push(
          toolMessage({
            callId: call.id,
            name: call.name,
            status: "ok",
            data: outcome.data,
            summary: outcome.summary,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "tool failed";
        steps.push({ tool: call.name, arguments: args, status: "error", summary: message });
        messages.push(
          toolMessage({
            callId: call.id,
            name: call.name,
            status: "error",
            data: { error: message },
            summary: message,
          }),
        );
      }
    }
  }

  // Step budget exhausted: return what we have rather than pretending to finish.
  // Report the provider that was actually answering, not the routed primary.
  return {
    answer: finaliseAnswer("", steps, observations, providerError),
    steps,
    provider: active.name,
    model: active.model,
    fallback: active.kind === "builtin",
    pendingApproval: steps.filter((s) => s.status === "pending_approval"),
  };
}

/**
 * The last gate before an answer reaches a human.
 *
 *  - If the model produced no text, fall back to a readable summary of what the
 *    tools actually returned.
 *  - If the model was unreachable mid-loop, say so explicitly instead of letting
 *    a partial or empty transcript read as "there was nothing to find".
 *  - If the prose cites a money figure or a large number that no tool returned,
 *    the prose is unsound, so it is withheld and the raw observations are shown
 *    instead. A prompt asks the model to behave; this makes the guarantee.
 */
export function finaliseAnswer(
  text: string,
  steps: AgentStep[],
  observations: unknown[],
  providerError: string | null,
): string {
  const trimmed = text.trim();
  if (!trimmed) {
    const summary = summariseSteps(steps);
    return providerError ? `${NO_MODEL_MESSAGE}\n\n${summary}` : summary;
  }

  const invented = findUngroundedFigures(trimmed, observations);
  if (invented.length > 0) {
    console.warn(
      `[agent] withheld ungrounded answer (figures not in tool results: ${invented.join(", ")})`,
    );
    return `${FABRICATION_NOTICE}\n\n${summariseSteps(steps)}`;
  }

  return trimmed;
}

function toolMessage(result: ToolResult): ChatMessage {
  return {
    role: "user",
    content: JSON.stringify({
      tool: result.name,
      status: result.status,
      summary: result.summary,
      data: result.data,
    }),
  };
}

/** Readable fallback when no model produced prose but tools did run. */
function summariseSteps(steps: AgentStep[]): string {
  if (steps.length === 0) return "مش لاقي حاجة أقولها — مكتبتش نتيجة.";
  return steps
    .map((s) => {
      const label = s.tool;
      if (s.status === "pending_approval") return `- ${label}: محتاج موافقة — ${s.summary}`;
      if (s.status === "error") return `- ${label}: فشل — ${s.summary}`;
      return `- ${label}: ${s.summary}`;
    })
    .join("\n");
}
