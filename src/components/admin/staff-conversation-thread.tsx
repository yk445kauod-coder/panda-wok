"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { sendMessageAction } from "@/lib/actions/communication";
import { cn, formatDateTime, formatTime } from "@/lib/utils/format";

import { useErrorText } from "@/components/i18n-provider";
export type StaffChatMessage = {
  id: string;
  body: string;
  /** "staff" | "customer" | "system" — from messages.sender_kind. */
  senderKind: string;
  isInternalNote: boolean;
  createdAt: string;
  /** The staff member this viewer is signed in as. */
  mine: boolean;
  senderLabel: string;
};

/**
 * Staff-side conversation thread. Mirrors the customer thread but the identity
 * shown on every message is explicit (staff name, or "Customer"), so an
 * operator can always tell who wrote what. Realtime inserts refresh the server
 * component; sending goes through the shared server action.
 */
export function StaffConversationThread({
  conversationId,
  messages,
  disabled = false,
  disabledReason,
}: {
  conversationId: string;
  messages: StaffChatMessage[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const [body, setBody] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastId = messages.at(-1)?.id ?? null;

  useEffect(() => {
    if (disabled) return;

    const supabase = createClient();
    let cancelled = false;

    const channel = supabase
      .channel(`admin-conversation-${conversationId}`)
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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text || pending || disabled) return;

    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("body", text);
    if (internalNote) formData.set("isInternalNote", "on");

    const result = await sendMessageAction(formData);

    if (!result.ok) {
      setError(errorText(result.error));
      setPending(false);
      return;
    }

    setBody("");
    setInternalNote(false);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex-1 space-y-3 overflow-y-auto px-1 py-3"
        role="log"
        aria-live="polite"
        aria-label={`Conversation history, ${messages.length} message${
          messages.length === 1 ? "" : "s"
        }`}
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-700/70">
            No messages yet. Reply below to start the thread.
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
                  message.isInternalNote
                    ? "rounded-bl-sm border border-miso-500/40 bg-miso-300/25 text-ink-900"
                    : message.mine
                      ? "rounded-br-sm bg-vermilion-600 text-rice-50"
                      : "rounded-bl-sm bg-rice-200 text-ink-900",
                )}
              >
                <p
                  className={cn(
                    "mb-0.5 text-[10px] uppercase tracking-wide",
                    message.isInternalNote
                      ? "text-miso-600"
                      : message.mine
                        ? "text-rice-50/70"
                        : "text-ink-700/60",
                  )}
                >
                  {message.senderLabel}
                  {message.isInternalNote ? " · internal note" : ""}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px] tabular-nums",
                    message.mine && !message.isInternalNote
                      ? "text-rice-50/65"
                      : "text-ink-700/55",
                  )}
                  title={formatDateTime(message.createdAt)}
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
          {disabledReason ??
            "This conversation is closed. Reopen it to reply to the customer."}
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="sticky bottom-0 space-y-2 bg-rice-50/95 pt-3 backdrop-blur"
        >
          <label htmlFor="staff-chat-body" className="sr-only">
            Reply to the customer
          </label>
          <div className="flex gap-2">
            <textarea
              id="staff-chat-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="Reply to the customer…"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2.5 text-sm outline-none focus:border-miso-500"
            />
            <Button
              type="submit"
              size="sm"
              loading={pending}
              disabled={!body.trim()}
              aria-label="Send reply"
              className="size-11 shrink-0 self-end p-0"
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={internalNote}
              onChange={(event) => setInternalNote(event.target.checked)}
              className="size-4 rounded border-ink-900/20"
            />
            Internal note (never shown to the customer)
          </label>
        </form>
      )}
    </div>
  );
}
