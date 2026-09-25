import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { listInboxWithPreview } from "@/lib/services/messaging";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConversationStatusControl } from "@/components/admin/conversation-status-control";
import { formatRelative, humanise } from "@/lib/utils/format";
import { cn } from "@/lib/utils/format";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type ConversationStatus = Database["public"]["Enums"]["conversation_status"];

const TABS: { key: ConversationStatus | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "pending", label: "Waiting on customer" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

/**
 * Staff inbox. Unread threads are called out first so the queue is worked in
 * the order customers are actually waiting.
 */
export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireCapability("chat.manage");
  const params = await searchParams;

  const requested = params.status ?? "open";
  const status = TABS.some((tab) => tab.key === requested)
    ? (requested as ConversationStatus | "all")
    : "open";

  const conversations = await listInboxWithPreview({
    ...(status === "all" ? {} : { status }),
    limit: 60,
  });

  const unreadTotal = conversations.reduce((sum, row) => sum + row.staff_unread, 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Customer chat</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Direct conversations between customers and the Panda Wok team. Replies are
            visible to the customer; internal notes are not.
          </p>
        </div>
        {unreadTotal > 0 ? (
          <Badge tone="indigo">{unreadTotal} unread across this view</Badge>
        ) : (
          <Badge tone="success">Nothing unread here</Badge>
        )}
      </header>

      <nav aria-label="Filter conversations" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const active = tab.key === status;
          return (
            <Link
              key={tab.key}
              href={`/admin/chat?status=${tab.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium",
                active
                  ? "border-indigo-600 bg-indigo-600 text-rice-50"
                  : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {conversations.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-6" />}
          title="No conversations here"
          description="When a customer writes in, the thread appears here with their unread count and any linked order."
        />
      ) : (
        <ul className="space-y-3">
          {conversations.map((row) => (
            <li key={row.id} className="washi-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/chat/${row.id}`}
                      className="font-display text-base font-semibold text-ink-900 hover:text-indigo-600"
                    >
                      {row.subject?.trim() || "Conversation"}
                    </Link>
                    {row.staff_unread > 0 ? (
                      <Badge tone="indigo">{row.staff_unread} unread</Badge>
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
                      {humanise(row.status)}
                    </Badge>
                  </div>

                  <p className="mt-1.5 text-sm text-ink-800">
                    {row.customer_name ?? "Unnamed customer"}
                    {row.customer_phone ? (
                      <span className="text-ink-700/70"> · {row.customer_phone}</span>
                    ) : null}
                  </p>

                  {row.last_message ? (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-700/80">
                      {row.last_message_from_staff ? "Kitchen: " : "Customer: "}
                      {row.last_message}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-ink-700/60">No messages yet.</p>
                  )}

                  <p className="mt-1.5 text-xs text-ink-700/60">
                    Last activity {formatRelative(row.last_message_at)}
                    {row.related_order_id ? " · linked to an order" : ""}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Link
                    href={`/admin/chat/${row.id}`}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-rice-50 hover:bg-indigo-700"
                  >
                    Open thread
                  </Link>
                  <ConversationStatusControl
                    conversationId={row.id}
                    current={row.status}
                    compact
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
