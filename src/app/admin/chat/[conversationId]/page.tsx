import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Receipt } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { getConversationForStaff } from "@/lib/services/messaging";
import { Badge } from "@/components/ui/button";
import { ConversationStatusControl } from "@/components/admin/conversation-status-control";
import { StaffConversationThread } from "@/components/admin/staff-conversation-thread";
import { formatDateTime, humanise } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * One staff conversation. Internal notes are included here because the query
 * filters them for the customer view, not this one.
 */
export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const session = await requireCapability("chat.manage");

  const conversation = await getConversationForStaff(conversationId);
  if (!conversation) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/admin/chat"
        className="inline-flex items-center gap-1.5 text-sm text-ink-700 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All conversations
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {conversation.subject?.trim() || "Conversation"}
          </h1>
          <p className="mt-1 text-sm text-ink-700/80">
            {conversation.customer?.full_name ?? "Unnamed customer"}
            {conversation.customer?.phone ? (
              <>
                {" · "}
                <a
                  href={`tel:${conversation.customer.phone}`}
                  className="inline-flex items-center gap-1 text-plum-600 hover:text-plum-700"
                >
                  <Phone className="size-3.5" aria-hidden="true" />
                  {conversation.customer.phone}
                </a>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-ink-700/60">
            Started {formatDateTime(conversation.created_at)} · last message{" "}
            {formatDateTime(conversation.last_message_at)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge
              tone={
                conversation.status === "open"
                  ? "info"
                  : conversation.status === "pending"
                    ? "warning"
                    : "neutral"
              }
            >
              {humanise(conversation.status)}
            </Badge>
            {conversation.staff_unread > 0 ? (
              <Badge tone="plum">{conversation.staff_unread} unread</Badge>
            ) : null}
            {conversation.related_order_id ? (
              <Link href={`/admin/orders/${conversation.related_order_id}`}>
                <Badge tone="info">
                  <Receipt className="mr-1 size-3" aria-hidden="true" />
                  Linked order
                </Badge>
              </Link>
            ) : null}
          </div>
        </div>

        <div className="w-full max-w-xs">
          <ConversationStatusControl
            conversationId={conversation.id}
            current={conversation.status}
          />
        </div>
      </header>

      <StaffConversationThread
        conversationId={conversation.id}
        disabled={conversation.status === "closed"}
        disabledReason="This conversation is closed. Reopen it to send another reply."
        messages={conversation.messages.map((message) => ({
          id: String(message.id),
          body: message.body,
          senderKind: message.sender_kind,
          isInternalNote: message.is_internal_note,
          createdAt: message.created_at,
          mine: message.sender_id === session.actorId,
          senderLabel:
            message.sender_kind === "customer"
              ? (conversation.customer?.full_name ?? "Customer")
              : message.sender_kind === "staff"
                ? "Panda Wok team"
                : "System",
        }))}
      />
    </div>
  );
}
