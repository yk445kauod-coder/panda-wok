"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createConversationAction } from "@/lib/actions/communication";

/**
 * Starts a new conversation. The first message is required because an empty
 * thread gives staff nothing to act on.
 */
export function NewConversationForm({
  orders = [],
}: {
  orders?: { id: string; orderNumber: string }[];
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const formData = new FormData();
    formData.set("subject", subject);
    formData.set("message", message);
    if (orderId) formData.set("orderId", orderId);

    const result = await createConversationAction(formData);

    if (!result.ok) {
      setError(result.error.message);
      if ("fields" in result && result.fields) setFields(result.fields);
      setPending(false);
      return;
    }

    router.replace(`/chat?c=${result.data.conversationId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="washi-panel mt-4 p-4" noValidate>
      <h2 className="font-display text-lg font-semibold text-ink-900">
        Start a conversation
      </h2>
      <p className="mt-1 text-sm text-ink-700/80">
        Tell us what you need and we will reply in this thread.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-chili-500/30 bg-chili-500/8 p-3 text-sm text-chili-600"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <label htmlFor="conversation-subject" className="block text-sm font-medium text-ink-900">
          Subject
        </label>
        <input
          id="conversation-subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={120}
          required
          placeholder="Question about my delivery"
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        />
        {fields.subject ? (
          <p className="mt-1 text-xs text-chili-600">{fields.subject}</p>
        ) : null}
      </div>

      {orders.length > 0 ? (
        <div className="mt-3">
          <label htmlFor="conversation-order" className="block text-sm font-medium text-ink-900">
            Related order
          </label>
          <p className="mt-0.5 text-xs text-ink-700/65">Optional.</p>
          <select
            id="conversation-order"
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="">Not about a specific order</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                Order #{order.orderNumber}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-3">
        <label htmlFor="conversation-message" className="block text-sm font-medium text-ink-900">
          Message
        </label>
        <textarea
          id="conversation-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          maxLength={2000}
          required
          placeholder="How can we help?"
          className="mt-1.5 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 py-2 text-sm outline-none focus:border-miso-500"
        />
        {fields.message ? (
          <p className="mt-1 text-xs text-chili-600">{fields.message}</p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="mt-4 w-full" loading={pending}>
        Send message
      </Button>
    </form>
  );
}
