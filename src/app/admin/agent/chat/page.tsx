import Link from "next/link";
import { Bot, Plus } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getAdminLocale, getT } from "@/lib/i18n/server";
import { listAgentThreads, getAgentThread, createAgentThread } from "@/lib/services/agent-chat";
import { AgentChat } from "@/components/admin/agent-chat";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * The conversational agent console.
 *
 * With no `?thread` it opens a fresh conversation; with one it loads the thread.
 * Threads are scoped to the gate actor, so two staff members on the same device
 * do not see each other's history.
 */
export default async function AgentChatPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const session = await requireCapability("ai.manage");
  const params = await searchParams;
  const locale = await getAdminLocale();
  const t = await getT(locale);

  const ownerId = session.actorId ?? null;
  const threads = await listAgentThreads(ownerId);

  // Open the requested thread, else the newest, else start a fresh one so the
  // composer is immediately usable.
  const requested = params.thread ? await getAgentThread(params.thread, ownerId) : null;
  const thread =
    requested ??
    (threads[0] ? await getAgentThread(threads[0].id, ownerId) : null) ??
    (await (async () => {
      const id = await createAgentThread({
        ownerId,
        ownerLabel: session.profile?.full_name ?? null,
      });
      return getAgentThread(id, ownerId);
    })());

  const activeId = thread?.id ?? "";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-900">
            <Bot className="size-6 text-jade-600" aria-hidden="true" />
            {t("admin.agent.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700/80">
            {t("admin.agent.subtitle")}
          </p>
        </div>
        <Link
          href={`/admin/agent/chat?thread=${activeId}`}
          prefetch={false}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ink-900/15 px-4 text-sm text-ink-800 hover:bg-rice-200"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("admin.agent.newThread")}
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-1.5" aria-label={t("admin.agent.threads")}>
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-ink-700/60">
            {t("admin.agent.threads")}
          </h2>
          {threads.length === 0 ? (
            <p className="px-1 text-xs text-ink-700/70">{t("admin.agent.noThreads")}</p>
          ) : (
            <ul className="space-y-1">
              {threads.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/admin/agent/chat?thread=${item.id}`}
                    prefetch={false}
                    className={cn(
                      "block rounded-xl px-3 py-2 text-sm",
                      item.id === activeId
                        ? "bg-vermilion-600 text-rice-50"
                        : "text-ink-800 hover:bg-rice-200",
                    )}
                  >
                    <span className="line-clamp-1 font-medium">{item.title}</span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px]",
                        item.id === activeId ? "text-rice-50/70" : "text-ink-700/60",
                      )}
                    >
                      {formatDateTime(item.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="washi-panel p-4">
          {thread ? (
            <AgentChat
              threadId={thread.id}
              initialTurns={thread.messages}
              autoApplyAllowed={session.role === "owner" || session.role === "admin"}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
