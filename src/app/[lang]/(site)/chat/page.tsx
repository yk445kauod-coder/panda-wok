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
import { localePath } from "@/lib/i18n/config";
import { staticLocale, staticT } from "@/lib/i18n/static";

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ c?: string; new?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = staticLocale(lang);
  const t = staticT(locale);
  return buildMetadata({
    title: t("messages.metaTitle"),
    description: t("messages.metaDescription", { brand: "Panda Wok" }),
    path: localePath(locale, "/chat"),
    noIndex: true,
  });
}

export default async function ChatPage({ params, searchParams }: PageProps) {
  const [{ lang }, { c, new: isNew }] = await Promise.all([params, searchParams]);
  const locale = staticLocale(lang);
  const t = staticT(locale);

  const session = await getSession();
  if (!session) redirect(`/auth/sign-in?next=${encodeURIComponent(localePath(locale, "/chat"))}`);

  const flags = await getFeatureFlagMap();

  if (flags.chat === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title={t("messages.offTitle")}
          description={t("messages.offBody")}
          action={
            <Link
              href={localePath(locale, "/contact")}
              className="text-sm font-medium text-vermilion-600"
            >
              {t("messages.contactKitchen")}
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
          { name: t("common.account"), path: localePath(locale, "/account") },
          { name: t("messages.title"), path: localePath(locale, "/chat") },
        ]}
      />

      <header className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">{t("messages.title")}</h1>
          <p className="mt-1 text-sm text-ink-700/80">{t("messages.subtitle")}</p>
        </div>
        {conversations.length > 0 ? (
          <Link
            href={localePath(locale, "/chat?new=1")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-900/15 px-3.5 py-2.5 text-xs font-medium text-ink-900 hover:bg-rice-200"
          >
            <MessageSquarePlus className="size-3.5" aria-hidden="true" />
            {t("messages.new")}
          </Link>
        ) : null}
      </header>

      {conversations.length > 1 || (conversations.length > 0 && active) ? (
        <nav aria-label={t("messages.conversations")} className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={localePath(locale, `/chat?c=${conversation.id}`)}
              aria-current={active?.id === conversation.id ? "true" : undefined}
              className={
                active?.id === conversation.id
                  ? "shrink-0 rounded-full border border-vermilion-600 bg-vermilion-600 px-3.5 py-2 text-xs font-medium text-rice-50"
                  : "shrink-0 rounded-full border border-ink-900/12 bg-rice-50 px-3.5 py-2 text-xs font-medium text-ink-800 hover:bg-rice-200"
              }
            >
              {conversation.subject ?? t("messages.conversationFallback")}
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
          aria-label={active.subject ?? t("messages.noSubject")}
          className="washi-panel mt-4 flex min-h-0 flex-1 flex-col p-3"
        >
          <div className="border-b border-ink-900/8 px-1 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-900">
                {active.subject ?? t("messages.conversationFallback")}
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
                href={localePath(locale, `/orders/${active.related_order_id}`)}
                className="mt-1 inline-block text-xs font-medium text-vermilion-600 hover:text-vermilion-700"
              >
                {t("messages.aboutOrder")}
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
          title={t("messages.emptyTitle")}
          description={t("messages.emptyBody")}
          action={
            <Link
              href={localePath(locale, "/chat?new=1")}
              className="text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
            >
              {t("messages.start")}
            </Link>
          }
        />
      )}
    </div>
  );
}
