"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setConversationStatusAction } from "@/lib/actions/admin";
import { cn } from "@/lib/utils/format";
import type { Database } from "@/lib/types/database";

import { useErrorText, useT } from "@/components/i18n-provider";
type ConversationStatus = Database["public"]["Enums"]["conversation_status"];

const STATUSES: ConversationStatus[] = ["open", "pending", "closed"];

/**
 * Moderation control for one conversation. Writes go through the existing
 * server action, which re-checks the capability and the enum on the server.
 */
export function ConversationStatusControl({
  conversationId,
  current,
  compact = false,
}: {
  conversationId: string;
  current: ConversationStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const t = useT();
  const [pending, setPending] = useState<ConversationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply(status: ConversationStatus) {
    if (status === current) return;
    setPending(status);
    setError(null);

    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("status", status);

    const result = await setConversationStatusAction(formData);

    if (!result.ok) {
      setError(errorText(result.error));
      setPending(null);
      return;
    }

    setPending(null);
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div
        role="group"
        aria-label={t("admin.pages.chat.conversationStatus")}
        className={cn("flex flex-wrap gap-1.5", compact && "gap-1")}
      >
        {STATUSES.map((status) => {
          const active = status === current;
          return (
            <button
              key={status}
              type="button"
              onClick={() => apply(status)}
              disabled={pending !== null || active}
              aria-pressed={active}
              title={t(`admin.pages.chat.hint${status.charAt(0).toUpperCase()}${status.slice(1)}`)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-vermilion-600/40 disabled:cursor-default",
                active
                  ? "border-vermilion-600 bg-vermilion-600 text-rice-50"
                  : "border-ink-900/15 bg-rice-50 text-ink-800 hover:bg-rice-100 disabled:opacity-60",
              )}
            >
              {pending === status
                ? t("admin.pages.chat.pendingShort")
                : t(`admin.term.conversationStatus.${status}`)}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-chili-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
