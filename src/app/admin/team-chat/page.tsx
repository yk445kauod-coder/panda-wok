import Link from "next/link";
import { requireCapability } from "@/lib/auth/session";
import { listMyTeamThreads, listTeamPeers } from "@/lib/services/team-chat";
import { OpenDmButton } from "@/components/admin/open-dm-button";
import { formatRelative, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * Team chat: staff talking to each other. Distinct from the customer inbox —
 * a channel every member belongs to, plus 1:1 direct threads.
 */
export default async function AdminTeamChatPage() {
  await requireCapability("chat.manage");

  const [threads, peers] = await Promise.all([listMyTeamThreads(), listTeamPeers()]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Team chat</h1>
        <p className="mt-1 text-sm text-ink-700/80">
          Talk to the rest of the Pandas. Nobody outside the team can see this.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <ul className="space-y-2">
          {threads.length === 0 ? (
            <li className="rounded-2xl border border-ink-900/8 bg-rice-100 px-4 py-8 text-center text-sm text-ink-700/70">
              No threads yet.
            </li>
          ) : (
            threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/admin/team-chat/${thread.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-ink-900/8 bg-rice-50 px-4 py-3 transition-colors hover:border-vermilion-500/40 hover:bg-rice-100"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-900">
                        {thread.kind === "channel" ? `# ${thread.name}` : thread.name}
                      </span>
                      <span className="rounded-full bg-ink-900/6 px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-ink-700/70">
                        {thread.kind === "channel" ? "Channel" : "DM"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-700/60">
                      Active {formatRelative(thread.lastMessageAt)}
                    </span>
                  </span>
                  {thread.unread > 0 ? (
                    <span className="grid min-w-6 place-items-center rounded-full bg-vermilion-600 px-1.5 py-0.5 text-xs font-semibold text-rice-50">
                      {thread.unread}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))
          )}
        </ul>

        <aside className="rounded-2xl border border-ink-900/8 bg-rice-100 p-4">
          <h2 className="text-sm font-semibold text-ink-900">Start a direct message</h2>
          {peers.length === 0 ? (
            <p className="mt-2 text-xs text-ink-700/70">
              No other team members yet. Add them from Team &amp; users.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {peers.map((peer) => (
                <li key={peer.userId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-900">{peer.name}</span>
                    <span className="block text-3xs uppercase tracking-wide text-ink-700/60">
                      {humanise(peer.role)}
                    </span>
                  </span>
                  <OpenDmButton userId={peer.userId} name={peer.name} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
