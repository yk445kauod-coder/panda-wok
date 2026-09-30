"use client";

import { useRef, useState, useTransition } from "react";
import { Bot, Loader2, Send, Sparkles, User, Wrench } from "lucide-react";
import { askAgentAction, type AgentChatResult } from "@/lib/actions/agent-chat";
import type { AgentStep } from "@/lib/agent/conversation";
import { useT } from "@/components/i18n-provider";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils/format";

/**
 * The conversation pane. It is deliberately a plain form + server action rather
 * than a streaming socket: the console is passcode-gated, has no Supabase anon
 * client, and a tool-running turn is short enough that a spinner reads fine.
 *
 * What makes it useful is the activity log under each answer — every tool the
 * agent called, with its arguments and result — so a manager can see the agent
 * actually queried the order rather than trusting a sentence.
 */

export type ChatTurn = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  body: string;
  steps: AgentStep[];
  provider: string | null;
  model: string | null;
  created_at: string;
};

const SUGGESTIONS = [
  "عملنا إيه النهاردة؟",
  "إيه الأطباق اللي مش متاحة دلوقتي؟",
  "إيه اللي مخزونه قل؟",
  "وريني إيراد آخر 7 أيام.",
];

export function AgentChat({
  threadId,
  initialTurns,
  autoApplyAllowed,
}: {
  threadId: string;
  initialTurns: ChatTurn[];
  autoApplyAllowed: boolean;
}) {
  const t = useT();
  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [autoApply, setAutoApply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Local turn ids only need to be unique within the session, so a ref counter
  // avoids reaching for a random/clock value during render.
  const nextId = useRef(0);

  function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setError(null);
    setInput("");
    const optimisticId = `local-${(nextId.current += 1)}`;
    const optimistic: ChatTurn = {
      id: optimisticId,
      role: "user",
      body: message,
      steps: [],
      provider: null,
      model: null,
      created_at: new Date().toISOString(),
    };
    setTurns((prev) => [...prev, optimistic]);

    const formData = new FormData();
    formData.set("message", message);
    formData.set("threadId", threadId);
    formData.set("autoApply", autoApply ? "true" : "false");

    startTransition(async () => {
      const result = await askAgentAction(formData);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const payload = result.data as AgentChatResult;
      setTurns((prev) => [
        ...prev,
        {
          id: `answer-${(nextId.current += 1)}`,
          role: "assistant",
          body: payload.answer,
          steps: payload.steps,
          provider: payload.provider,
          model: payload.model,
          created_at: new Date().toISOString(),
        },
      ]);
    });
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-96 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {turns.length === 0 ? (
          <div className="washi-panel p-6 text-center">
            <Sparkles className="mx-auto size-6 text-jade-600" aria-hidden="true" />
            <p className="mt-2 text-sm text-ink-800">{t("admin.agent.chatEmpty")}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-ink-900/12 bg-rice-50 px-3 py-1.5 text-xs text-ink-800 hover:bg-rice-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn) => <TurnBubble key={turn.id} turn={turn} />)
        )}

        {pending ? (
          <div className="flex items-center gap-2 text-sm text-ink-700">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("admin.agent.thinking")}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mb-2 rounded-lg bg-vermilion-600/10 px-3 py-2 text-sm text-vermilion-700">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-ink-900/10 pt-3"
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={t("admin.agent.chatPlaceholder")}
          className="min-h-11 flex-1 resize-none rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2.5 text-sm outline-none focus:border-miso-500"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-vermilion-600 px-4 text-sm font-medium text-rice-50 disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden="true" />
          {t("admin.agent.send")}
        </button>
      </form>

      {autoApplyAllowed ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(event) => setAutoApply(event.target.checked)}
            className="size-3.5 rounded border-ink-900/25"
          />
          {t("admin.agent.autoApply")}
        </label>
      ) : null}
    </div>
  );
}

function TurnBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-jade-600/15 text-jade-700">
          <Bot className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className={cn("max-w-[85%] space-y-2", isUser ? "items-end" : "")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm",
            isUser
              ? "whitespace-pre-wrap bg-vermilion-600 text-rice-50"
              : "border border-ink-900/10 bg-rice-50 text-ink-900",
          )}
        >
          {isUser ? turn.body : <Markdown>{turn.body}</Markdown>}
        </div>
        {turn.steps.length > 0 ? <StepLog steps={turn.steps} /> : null}
      </div>
      {isUser ? (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-900/10 text-ink-700">
          <User className="size-4" aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}

function StepLog({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false);
  const wrote = steps.some((s) => s.status === "pending_approval");
  return (
    <div className="rounded-xl border border-ink-900/10 bg-rice-100/60 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink-700"
      >
        <Wrench className="size-3.5" aria-hidden="true" />
        <span>
          {steps.length} {steps.length === 1 ? "step" : "steps"}
        </span>
        {wrote ? (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-800">
            needs approval
          </span>
        ) : null}
        <span className="ms-auto text-ink-700/60">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <ul className="space-y-1.5 border-t border-ink-900/10 px-3 py-2">
          {steps.map((step, index) => (
            <li key={`${step.tool}-${index}`} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  step.status === "ok"
                    ? "bg-jade-600"
                    : step.status === "pending_approval"
                      ? "bg-amber-500"
                      : "bg-vermilion-600",
                )}
              />
              <div>
                <span className="font-medium text-ink-900">{step.tool}</span>
                <span className="text-ink-700"> — {step.summary}</span>
                {Object.keys(step.arguments).length > 0 ? (
                  <pre className="mt-0.5 overflow-x-auto text-[11px] text-ink-700/80">
                    {JSON.stringify(step.arguments)}
                  </pre>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
