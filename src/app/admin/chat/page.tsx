import Link from "next/link";
import { Inbox, MessagesSquare, Users } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import {
  countUnreadForStaff,
  listInboxWithPreview,
} from "@/lib/services/messaging";
import { listMyTeamThreads, listTeamPeers } from "@/lib/services/team-chat";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConversationStatusControl } from "@/components/admin/conversation-status-control";
import { OpenDmButton } from "@/components/admin/open-dm-button";
import { formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils/format";
import { getAdminLocale, getT } from "@/lib/i18n/server";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type ConversationStatus = Database["public"]["Enums"]["conversation_status"];

const CUSTOMER_TABS: (ConversationStatus | "all")[] = ["open", "pending", "closed", "all"];

/**
 * One chat hub for the whole team. Customer conversations and internal team
 * chat used to be separate nav entries rewriting the same idea; they are now
 * two tabs of a single screen, so a shift works the inbox and talks to
 * colleagues without leaving the page.
 */
export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  await requireCapability("chat.manage");
  const params = await searchParams;
  const t = await getT(await getAdminLocale());

  const tab = params.tab === "team" ? "team" : "customers";

  const [unread, teamThreads] = await Promise.all([
    countUnreadForStaff().catch(() => 0),
    listMyTeamThreads().catch(() => []),
  ]);
  const teamUnread = teamThreads.reduce((sum, thread) => sum + thread.unread, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">{t("admin.pages.chat.title")}</h1>
        <p className="mt-1 text-sm text-ink-700/80">{t("admin.pages.chat.description")}</p>
      </header>

      <nav
        aria-label={t("admin.pages.chat.sections")}
        className="flex gap-2 rounded-2xl border border-ink-900/8 bg-rice-100 p-1"
      >
        <TabLink
          href="/admin/chat?tab=customers"
          active={tab === "customers"}
          icon={<Inbox className="size-4" aria-hidden="true" />}
          label={t("admin.pages.chat.customers")}
          count={unread}
        />
        <TabLink
          href="/admin/chat?tab=team"
          active={tab === "team"}
          icon={<MessagesSquare className="size-4" aria-hidden="true" />}
          label={t("admin.pages.chat.team")}
          count={teamUnread}
        />
      </nav>

      {tab === "customers" ? (
        <CustomerInbox requestedStatus={params.status} />
      ) : (
        <TeamChatPanel />
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  icon,
  label,
  count,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-vermilion-600 text-rice-50 shadow-sm"
          : "text-ink-800 hover:bg-rice-200",
      )}
    >
      {icon}
      <span>{label}</span>
      {count > 0 ? (
        <span
          className={cn(
            "grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold",
            active ? "bg-rice-50/25 text-rice-50" : "bg-vermilion-600 text-rice-50",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

async function CustomerInbox({ requestedStatus }: { requestedStatus?: string }) {
  const t = await getT(await getAdminLocale());
  const status = CUSTOMER_TABS.includes(requestedStatus as ConversationStatus | "all")
    ? (requestedStatus as ConversationStatus | "all")
    : "open";

  const conversations = await listInboxWithPreview({
    ...(status === "all" ? {} : { status }),
    limit: 60,
  });

  return (
    <div className="space-y-4">
      <nav
        aria-label={t("admin.pages.chat.filterConversations")}
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {CUSTOMER_TABS.map((tab) => {
          const active = tab === status;
          return (
            <Link
              key={tab}
              href={`/admin/chat?tab=customers&status=${tab}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium",
                active
                  ? "border-vermilion-600 bg-vermilion-600 text-rice-50"
                  : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
              )}
            >
              {tab === "all"
                ? t("admin.pages.orders.all")
                : t(`admin.term.conversationStatus.${tab}`)}
            </Link>
          );
        })}
      </nav>

      {conversations.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" />}
          title={t("admin.pages.chat.noConversations")}
          description={t("admin.pages.chat.noConversationsBody")}
        />
      ) : (
        <ul className="space-y-3">
          {conversations.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/chat/${row.id}`}
                className="washi-panel flex items-start gap-3 p-4 transition-shadow hover:shadow-washi-lg"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-vermilion-600/10 text-sm font-semibold text-vermilion-700">
                  {(row.customer_name ?? "?").trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-display text-base font-semibold text-ink-900">
                      {row.customer_name ?? t("admin.pages.chat.unnamedCustomer")}
                    </span>
                    {row.staff_unread > 0 ? (
                      <Badge tone="indigo">
                        {t("admin.pages.chat.newCount", { count: row.staff_unread })}
                      </Badge>
                    ) : null}
                    <Badge
                      tone={
                        row.status === "open"
                          ? "info"
                          : row.status === "pending"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {t(`admin.term.conversationStatus.${row.status}`)}
                    </Badge>
                  </span>
                  {row.subject ? (
                    <span className="mt-0.5 block truncate text-xs font-medium text-ink-800">
                      {row.subject}
                    </span>
                  ) : null}
                  <span className="mt-1 block line-clamp-2 text-sm text-ink-700/80">
                    {row.last_message
                      ? `${row.last_message_from_staff ? `${t("admin.pages.chat.youPrefix")} ` : ""}${row.last_message}`
                      : t("admin.pages.chat.noMessages")}
                  </span>
                  <span className="mt-1 block text-xs text-ink-700/60">
                    {formatRelative(row.last_message_at)}
                    {row.customer_phone ? ` · ${row.customer_phone}` : ""}
                  </span>
                </span>
                <span className="hidden shrink-0 sm:block">
                  <ConversationStatusControl
                    conversationId={row.id}
                    current={row.status}
                    compact
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function TeamChatPanel() {
  const t = await getT(await getAdminLocale());
  const [threads, peers] = await Promise.all([listMyTeamThreads(), listTeamPeers()]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <ul className="space-y-2">
        {threads.length === 0 ? (
          <li className="rounded-2xl border border-ink-900/8 bg-rice-100 px-4 py-8 text-center text-sm text-ink-700/70">
            {t("admin.pages.chat.noThreads")}
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
                      {thread.kind === "channel"
                        ? t("admin.pages.chat.channel")
                        : t("admin.pages.chat.direct")}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-700/60">
                    {t("admin.pages.chat.activeAgo", { when: formatRelative(thread.lastMessageAt) })}
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

      <aside className="washi-panel h-fit p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Users className="size-4 text-ink-700/70" aria-hidden="true" />
          {t("admin.pages.chat.messageTeammate")}
        </h2>
        {peers.length === 0 ? (
          <p className="mt-2 text-xs text-ink-700/70">
            {t("admin.pages.chat.noTeammates")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {peers.map((peer) => (
              <li key={peer.userId} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-900">{peer.name}</span>
                  <span className="block text-3xs uppercase tracking-wide text-ink-700/60">
                    {t(`admin.term.role.${peer.role}`)}
                  </span>
                </span>
                <OpenDmButton userId={peer.userId} name={peer.name} />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
