"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Send, X } from "lucide-react";
import { Mascot } from "page-mascot";
import { Button, Spinner } from "@/components/ui/button";
import { askAssistantAction } from "@/lib/actions/assistant";
import { useAssistant } from "@/components/panda/assistant-context";
import { cn } from "@/lib/utils/format";
import { useErrorText } from "@/components/i18n-provider";

type Turn = {
  role: "user" | "assistant";
  content: string;
  status?: string;
};

const SUGGESTIONS = [
  "What is good for two people?",
  "Which dishes are spicy?",
  "Do you have vegetarian options?",
  "How much is delivery?",
  "How do loyalty points work?",
];

/** Sprite animation per conversational state; styling lives in globals.css. */
type AssistantMood =
  | "idle"
  | "watching"
  | "thinking"
  | "speaking"
  | "surprised"
  | "happy"
  | "greeting";

/**
 * The Panda assistant. Tapping the mascot opens a chat sheet; answers come
 * from the server action, which is grounded in live database data. When the
 * answer came from the deterministic fallback the UI says so rather than
 * implying a model replied.
 */
export function PandaAssistant({
  brandName,
  disclosure,
}: {
  brandName: string;
  disclosure: string;
}) {
  const { open: open, closeAssistant } = useAssistant();
  const close = closeAssistant;
  // The transient sprite reaction on the panel avatar. The resting pose is
  // derived below rather than written back from an effect.
  const [moodState, setMoodState] = useState<AssistantMood>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const errorText = useErrorText();
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();
  const mood: AssistantMood = open && moodState === "idle" ? "watching" : moodState;
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  useEffect(() => {
    schedule(() => setMoodState("greeting"), 1400);
    schedule(() => setMoodState("idle"), 4200);
    return () => {
      for (const id of timers.current) clearTimeout(id);
      timers.current = [];
    };
  }, [schedule]);

  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [turns, pending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || pending) return;

      setError(null);
      setInput("");
      const history = turns.slice(-6).map((t) => ({ role: t.role, content: t.content }));
      setTurns((current) => [...current, { role: "user", content: trimmed }]);
      setPending(true);
      setMoodState("thinking");

      try {
        const result = await askAssistantAction({ question: trimmed, history });

        if (!result.ok) {
          setError(errorText(result.error));
          setMoodState("surprised");
          schedule(() => setMoodState("idle"), 2200);
          return;
        }

        setTurns((current) => [
          ...current,
          {
            role: "assistant",
            content: result.data.answer,
            status: result.data.status,
          },
        ]);
        setMoodState("speaking");
        schedule(() => setMoodState("happy"), 900);
        schedule(() => setMoodState("idle"), 2600);
      } catch {
        setError("The assistant could not be reached. Please try again.");
        setMoodState("surprised");
        schedule(() => setMoodState("idle"), 2200);
      } finally {
        setPending(false);
      }
    },
    [pending, turns, schedule, errorText],
  );

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.section
            id={panelId}
            role="dialog"
            aria-label={`${brandName} assistant`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col overflow-hidden",
              "rounded-t-2xl border border-b-0 border-ink-900/12 bg-rice-50 shadow-washi-lg",
              "md:inset-x-auto md:bottom-24 md:right-6 md:w-[26rem] md:rounded-2xl md:border-b",
            )}
          >
            <header className="flex items-center gap-3 border-b border-ink-900/8 px-4 py-3">
              <span
                data-mood={mood}
                className="assistant-mascot grid size-10 shrink-0 place-items-center"
              >
                <Mascot
                  directions="/mascots/panda-directions.webp"
                  reactions="/mascots/panda-reactions.webp"
                  size={38}
                  label="Panda Wok assistant"
                />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-base font-semibold text-ink-900">
                  Panda assistant
                </h2>
                <p className="truncate text-xs text-ink-700/70">
                  Answers come from the live menu
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close assistant"
                className="grid size-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-900/5"
              >
                <X className="size-4" />
              </button>
            </header>

            <div
              ref={scroller}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
              aria-live="polite"
            >
              {turns.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-ink-700/85">
                    Ask me about our dishes, prices, allergens, delivery or loyalty
                    points.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void ask(suggestion)}
                        className="rounded-full border border-ink-900/12 bg-rice-100 px-3 py-1.5 text-xs text-ink-800 hover:bg-rice-200"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {turns.map((turn, index) => (
                <div
                  key={index}
                  className={cn(
                    "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    turn.role === "user"
                      ? "ml-auto bg-indigo-600 text-rice-50"
                      : "border border-ink-900/8 bg-rice-100 text-ink-900",
                  )}
                >
                  {turn.content}
                  {turn.role === "assistant" && turn.status === "fallback" ? (
                    <span className="mt-2 block border-t border-ink-900/8 pt-1.5 text-[11px] text-ink-700/60">
                      Answered directly from Panda Wok menu data.
                    </span>
                  ) : null}
                </div>
              ))}

              {pending ? (
                <div className="flex items-center gap-2 text-sm text-ink-700/70">
                  <Spinner className="size-4" />
                  Checking the menu…
                </div>
              ) : null}

              {error ? (
                <div
                  role="alert"
                  className="rounded-xl border border-chili-500/25 bg-chili-500/8 px-3 py-2 text-sm text-chili-600"
                >
                  {error}
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void ask(input);
              }}
              className="border-t border-ink-900/8 px-3 py-3 pb-safe"
            >
              <div className="flex items-center gap-2">
                <label htmlFor="panda-assistant-input" className="sr-only">
                  Your question
                </label>
                <input
                  id="panda-assistant-input"
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={600}
                  placeholder="Ask about the menu…"
                  className="h-11 flex-1 rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
                />
                <Button
                  type="submit"
                  size="md"
                  loading={pending}
                  disabled={!input.trim()}
                >
                  <Send className="size-4" aria-hidden="true" />
                  <span className="sr-only">Send</span>
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-ink-700/60">
                {disclosure}
              </p>
            </form>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </>
  );
}
