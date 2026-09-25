import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { getSession } from "@/lib/auth/session";
import { getMyConversations, getConversationForViewer } from "@/lib/services/messaging";
import { getFeatureFlagMap } from "@/lib/services/catalog";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { ConversationThread } from "@/components/customer/conversation-thread";
import { NewConversationForm } from "@/components/customer/new-conversation-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/button";
import { formatDateTime, humanise } from "@/lib/utils/format";

export const metadata: Metadata = buildMetadata({
  title: "Messages",
  description: "Talk to the Panda Wok kitchen about an order or a question.",
  path: "/chat",
  noIndex: true,
});

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in?next=%2Fchat");

  const [{ c, new: isNew }, flags] = await Promise.all([searchParams, getFeatureFlagMap()]);

  if (flags.chat === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title="Messaging is switched off"
          description="Direct messaging is not available right now. Please use the contact page instead."
          action={
            <Link href="/contact" className="text-sm font-medium text-indigo-600">
              Contact the kitchen
            </Link>
          }
        />
      </div>
    );
  }

  const conversations = await getMyConversations(session.user.id);
  const active = c ? await getConversationForViewer(c) : null;
  const showNewForm = isNew === "1" || conversations.length === 0;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-2xl flex-col px-4 py-6">
      <Breadcrumbs
        items={[
          { name: "Account", path: "/account" },
          { name: "Messages", path: "/chat" },
        ]}
      />

      <header className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Messages</h1>
          <p className="mt-1 text-sm text-ink-700/80">
            Ask about an order or tell us something — a person from the kitchen replies.
          </p>
        </div>
        {conversations.length > 0 ? (
          <Link
            href="/chat?new=1"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-900/15 px-3.5 py-2.5 text-xs font-medium text-ink-900 hover:bg-rice-200"
          >
            <MessageSquarePlus className="size-3.5" aria-hidden="true" />
            New
          </Link>
        ) : null}
      </header>

      {/* Conversation switcher */}
      {conversations.length > 1 || (conversations.length > 0 && active) ? (
        <nav aria-label="Your conversations" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/chat?c=${conversation.id}`}
              aria-current={active?.id === conversation.id ? "true" : undefined}
              className={
                active?.id === conversation.id
                  ? "shrink-0 rounded-full border border-indigo-600 bg-indigo-600 px-3.5 py-2 text-xs font-medium text-rice-50"
                  : "shrink-0 rounded-full border border-ink-900/12 bg-rice-50 px-3.5 py-2 text-xs font-medium text-ink-800 hover:bg-rice-200"
              }
            >
              {conversation.subject ?? "Conversation"}
              {conversation.customer_unread > 0 ? (
                <span className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full bg-chili-500 text-[10px] text-rice-50">
                  {conversation.customer_unread}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}

      {showNewForm ? (
        <NewConversationForm />
      ) : active ? (
        <section
          aria-label={`Conversation: ${active.subject ?? "no subject"}`}
          className="washi-panel mt-4 flex min-h-0 flex-1 flex-col p-3"
        >
          <div className="border-b border-ink-900/8 px-1 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-900">
                {active.subject ?? "Conversation"}
              </h2>
              <div className="flex items-center gap-2">
                <Badge tone={active.status === "closed" ? "neutral" : "info"}>
                  {humanise(active.status)}
                </Badge>
                <span className="text-xs text-ink-700/65">
                  {formatDateTime(active.last_message_at)}
                </span>
              </div>
            </div>
            {active.related_order_id ? (
              <Link
                href={`/orders/${active.related_order_id}`}
                className="mt-1 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                About an order
              </Link>
            ) : null}
          </div>

          <ConversationThread
            conversationId={active.id}
            disabled={active.status === "closed"}
            messages={active.messages.map((message) => ({
              id: message.id,
              body: message.body,
              senderKind: message.sender_kind,
              isInternalNote: message.is_internal_note,
              createdAt: message.created_at,
              mine: message.sender_id === session.user.id,
            }))}
          />
        </section>
      ) : (
        <EmptyState
          className="mt-4"
          title="No conversation selected"
          description="Pick a conversation above to read it, or start a new one."
          action={
            <Link
              href="/chat?new=1"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Start a conversation
            </Link>
          }
        />
      )}
    </div>
  );
}
