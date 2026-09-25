"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { sendMessageAction, markConversationReadAction } from "@/lib/actions/communication";
import { cn, formatTime } from "@/lib/utils/format";

import { useErrorText } from "@/components/i18n-provider";
export type ChatMessage = {
  id: string;
  body: string;
  senderKind: string;
  isInternalNote: boolean;
  createdAt: string;
  /** True when the signed-in viewer wrote this message. */
  mine: boolean;
};

/**
 * Customer conversation thread. New messages arrive over Supabase Realtime and
 * refresh the server component; sending goes through a server action so
 * ownership is verified before anything is written.
 */
export function ConversationThread({
  conversationId,
  messages,
  disabled = false,
  disabledReason,
}: {
  conversationId: string;
  messages: ChatMessage[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastId = messages.at(-1)?.id ?? null;

  // Realtime: any insert on this conversation refreshes the thread.
  useEffect(() => {
    if (disabled) return;

    const supabase = createClient();
    let cancelled = false;

    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          if (!cancelled) router.refresh();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, disabled, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  // Mark the thread read when it is opened with unread staff replies.
  useEffect(() => {
    if (disabled) return;
    void markConversationReadAction(conversationId);
  }, [conversationId, disabled]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text || pending || disabled) return;

    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("body", text);

    const result = await sendMessageAction(formData);

    if (!result.ok) {
      setError(errorText(result.error));
      setPending(false);
      return;
    }

    setBody("");
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-1 py-3" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-700/70">
            No messages yet. Write the first one below.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                  message.mine
                    ? "rounded-br-sm bg-indigo-600 text-rice-50"
                    : "rounded-bl-sm bg-rice-200 text-ink-900",
                )}
              >
                <p
                  className={cn(
                    "mb-0.5 text-[10px] uppercase tracking-wide",
                    message.mine ? "text-rice-50/70" : "text-ink-700/60",
                  )}
                >
                  {message.mine ? "You" : "Panda Wok"}
                  {message.isInternalNote ? " (note)" : ""}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px] tabular-nums",
                    message.mine ? "text-rice-50/65" : "text-ink-700/55",
                  )}
                >
                  {formatTime(message.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p role="alert" className="px-1 pt-2 text-xs text-chili-600">
          {error}
        </p>
      ) : null}

      {disabled ? (
        <p className="mt-2 rounded-xl bg-rice-200/70 px-3.5 py-3 text-xs text-ink-700/80">
          {disabledReason ?? "This conversation is closed. Start a new one if you need us."}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="sticky bottom-0 flex gap-2 bg-rice-50/95 pt-3 backdrop-blur">
          <label htmlFor="chat-body" className="sr-only">
            Your message
          </label>
          <textarea
            id="chat-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Write a message…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2.5 text-sm outline-none focus:border-miso-500"
          />
          <Button
            type="submit"
            size="sm"
            loading={pending}
            disabled={!body.trim()}
            aria-label="Send message"
            className="size-11 shrink-0 p-0"
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
      )}
    </div>
  );
}
