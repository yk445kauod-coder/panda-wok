import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCapability, getAdminSession } from "@/lib/auth/session";
import { getTeamThread } from "@/lib/services/team-chat";
import { TeamThread } from "@/components/admin/team-thread";
import { getAdminLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function TeamThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  await requireCapability("chat.manage");
  const { threadId } = await params;
  const t = await getT(await getAdminLocale());

  const [thread, session] = await Promise.all([getTeamThread(threadId), getAdminSession()]);
  if (!thread) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/admin/team-chat"
        className="inline-flex items-center gap-1.5 text-sm text-ink-700/80 transition-colors hover:text-ink-900"
      >
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {t("admin.pages.conversation.allThreads")}
      </Link>
      <div className="flex min-h-[60vh] flex-col rounded-2xl border border-ink-900/8 bg-rice-50 p-4">
        <TeamThread
          threadId={threadId}
          messages={thread.messages}
          currentUserId={session?.actorId ?? null}
        />
      </div>
    </div>
  );
}
