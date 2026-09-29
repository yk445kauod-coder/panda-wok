"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { openTeamDmAction } from "@/lib/actions/team-chat";
import { useErrorText, useT } from "@/components/i18n-provider";

/** Opens (or reuses) the 1:1 thread with a team member, then navigates to it. */
export function OpenDmButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const errorText = useErrorText();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await openTeamDmAction(userId);
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      router.push(`/admin/team-chat/${result.data.threadId}`);
    });
  }

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label={t("admin.pages.chat.messageName", { name })}
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-ink-900/12 text-ink-700 transition-colors hover:border-vermilion-500/50 hover:text-vermilion-700 disabled:opacity-50"
      >
        <MessageSquarePlus className="size-4" aria-hidden="true" />
      </button>
      {error ? (
        <span role="alert" className="mt-1 text-3xs text-chili-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
