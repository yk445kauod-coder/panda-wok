import Link from "next/link";
import { Inbox, MessageSquare } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import {
  countUnreadForStaff,
  listInboxWithPreview,
  listRecentCustomerMessages,
} from "@/lib/services/messaging";
import { Badge } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelative, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * Staff inbox. A single place to see what customers are waiting on: unread
 * threads first, then the freshest customer-authored messages across all
 * conversations. Staff replies and internal notes are excluded — this view is
 * about the customer's side of the conversation.
 */
export default async function AdminMessagesPage() {
  await requireCapability("chat.manage");

  const [unread, recent, inbox] = await Promise.all([
    countUnreadForStaff(),
    listRecentCustomerMessages(40),
    listInboxWithPreview({ status: "open", limit: 8 }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Messages</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Customer messages across every conversation. Replies live in the thread.
          </p>
        </div>
        {unread > 0 ? (
          <Badge tone="plum">{unread} unread</Badge>
        ) : (
          <Badge tone="success">Nothing waiting</Badge>
        )}
      </header>

      <section aria-label="Threads needing a reply">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Waiting on the kitchen
          </h2>
          <Link
            href="/admin/chat"
            className="text-xs font-medium text-plum-600 hover:text-plum-700"
          >
            Open full inbox
          </Link>
        </div>

        {inbox.length === 0 ? (
          <EmptyState
            className="mt-3"
            title="No open conversations"
            description="Every conversation is currently answered or closed."
          />
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {inbox.map((row) => (
              <li key={row.id} className="washi-panel p-3">
                <Link
                  href={`/admin/chat/${row.id}`}
                  className="flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {row.subject?.trim() || "Conversation"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-700/75">
                      {row.customer_name ?? "Unnamed customer"}
                      {row.last_message ? ` · ${row.last_message}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-ink-700/60">
                      {formatRelative(row.last_message_at)}
                    </p>
                  </div>
                  {row.staff_unread > 0 ? (
                    <Badge tone="plum">{row.staff_unread}</Badge>
                  ) : (
                    <Badge tone="info">{humanise(row.status)}</Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Latest customer messages">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <Inbox className="size-4 text-ink-700/70" aria-hidden="true" />
          Latest from customers
        </h2>

        {recent.length === 0 ? (
          <EmptyState
            className="mt-3"
            icon={<MessageSquare className="size-6" />}
            title="No customer messages yet"
            description="When a customer writes in, their message appears here with a link into the thread."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {recent.map((message) => (
              <li key={String(message.id)} className="washi-panel p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-900">
                      <span className="font-medium">
                        {message.customer_name ?? "Unnamed customer"}
                      </span>
                      <span className="text-ink-700/65">
                        {" · "}
                        {formatRelative(message.created_at)}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800/90">
                      {message.body}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {message.conversation ? (
                      <>
                        <Link
                          href={`/admin/chat/${message.conversation.id}`}
                          className="rounded-lg bg-plum-600 px-3 py-1.5 text-xs font-medium text-rice-50 hover:bg-plum-700"
                        >
                          Reply
                        </Link>
                        <span className="text-[11px] text-ink-700/60">
                          {humanise(message.conversation.status)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-ink-700/60">
                        Thread unavailable
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
