import "server-only";

import type { Capability } from "@/lib/auth/rbac";
import {
  buildDbProviderChain,
  loadDbProviders,
  type AiProvider,
  type ChatMessage,
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
perform operational actions. Reply in the language the question is written in.

Rules you must follow:
- Ground every claim in a tool result. If you did not call a tool, say what you
  would look up rather than guessing a number.
- Prefer calling a tool over describing what a tool could do.
- A tool that changes data may require approval; if you are told a call is
  pending, report that plainly instead of assuming it succeeded.
- Be concise. Staff are reading this during service. Lead with the answer.
- Never invent menu items, prices, customers or orders.`;

/** Providers that can call tools natively; otherwise the model gets no tools. */
function supportsTools(provider: AiProvider): boolean {
  return typeof provider.completeWithTools === "function";
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

  const chain = await buildDbProviderChain({ rows: await loadDbProviders(), binding: null }, () =>
    // The deterministic floor answers with an honest "I have no model" line;
    // the loop below still runs so the transcript shows the attempt.
    "I could not reach a language model, so I can only repeat what my tools returned.",
  );
  const provider = chain.primary ?? chain.fallbacks[0] ?? chain.fallback;

  const steps: AgentStep[] = [];

  for (let step = 0; step < maxSteps; step += 1) {
    let turn: Awaited<ReturnType<typeof nextTurn>>;
    try {
      turn = await nextTurn(provider, messages, tools, { temperature: 0.3, maxTokens: 900 });
    } catch {
      // A provider hiccup mid-loop must not discard the work already done:
      // stop and let the caller see the steps that succeeded.
      break;
    }

    if (turn.toolCalls.length === 0) {
      return {
        answer: turn.text || summariseSteps(steps),
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
  return {
    answer: summariseSteps(steps),
    steps,
    provider: provider.name,
    model: provider.model,
    fallback: provider.kind === "builtin",
    pendingApproval: steps.filter((s) => s.status === "pending_approval"),
  };
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
  if (steps.length === 0) return "I did not find anything to report.";
  return steps
    .map((s) => `- ${s.tool}: ${s.status === "pending_approval" ? `needs approval — ${s.summary}` : s.summary}`)
    .join("\n");
}
