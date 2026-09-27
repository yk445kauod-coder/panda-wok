"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { sendTeamMessageAction } from "@/lib/actions/team-chat";
import { useErrorText } from "@/components/i18n-provider";
import { cn, formatDateTime, formatTime } from "@/lib/utils/format";
import type { TeamMessage } from "@/lib/services/team-chat";

/**
 * Team thread. The admin console has no Supabase auth session, so unlike the
 * customer threads this does not subscribe to Realtime — the service-role write
 * path has no anon key to open a channel with. Instead it optimistically
 * refreshes the server component after a send, which is enough for a small
 * internal team and keeps one code path for both sides of a thread.
 */
export function TeamThread({
  threadId,
  messages,
  currentUserId,
}: {
  threadId: string;
  messages: TeamMessage[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastId = messages.at(-1)?.id ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text || pending) return;

    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("threadId", threadId);
    formData.set("body", text);

    const result = await sendTeamMessageAction(formData);

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
      <div
        className="flex-1 space-y-3 overflow-y-auto px-1 py-3"
        role="log"
        aria-live="polite"
        aria-label={`Team chat, ${messages.length} message${messages.length === 1 ? "" : "s"}`}
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-700/70">
            No messages yet. Say hello below.
          </p>
        ) : (
          messages.map((message) => {
            const mine = Boolean(currentUserId) && message.senderId === currentUserId;
            return (
              <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                    mine
                      ? "rounded-br-sm bg-vermilion-600 text-rice-50"
                      : "rounded-bl-sm bg-rice-200 text-ink-900",
                  )}
                >
                  <p
                    className={cn(
                      "mb-0.5 text-[10px] uppercase tracking-wide",
                      mine ? "text-rice-50/70" : "text-ink-700/60",
                    )}
                  >
                    {message.senderName}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px] tabular-nums",
                      mine ? "text-rice-50/65" : "text-ink-700/55",
                    )}
                    title={formatDateTime(message.createdAt)}
                  >
                    {formatTime(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p role="alert" className="px-1 pt-2 text-xs text-chili-600">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="sticky bottom-0 space-y-2 bg-rice-50/95 pt-3 backdrop-blur">
        <label htmlFor="team-chat-body" className="sr-only">
          Write a message
        </label>
        <div className="flex gap-2">
          <textarea
            id="team-chat-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder="Write a message…"
            className="min-h-11 flex-1 resize-none rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-vermilion-500"
          />
          <Button type="submit" disabled={pending || body.trim().length === 0} className="self-end">
            <Send className="size-4" aria-hidden="true" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
