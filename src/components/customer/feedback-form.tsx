"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/format";
import { submitFeedbackAction } from "@/lib/actions/communication";

const CATEGORIES = [
  { key: "overall", label: "Overall experience" },
  { key: "food_quality", label: "Food quality" },
  { key: "delivery", label: "Delivery" },
  { key: "service", label: "Service" },
  { key: "other", label: "Something else" },
] as const;

const RATING_LABELS = [
  "",
  "Not good",
  "Could be better",
  "Fine",
  "Really good",
  "Excellent",
];

/**
 * Feedback form. Works with or without a linked order; when the customer picks
 * an order the server verifies it belongs to them before storing.
 */
export function FeedbackForm({
  orders,
  defaultOrderId,
}: {
  orders: { id: string; orderNumber: string }[];
  defaultOrderId?: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["key"]>("overall");
  const [orderId, setOrderId] = useState(defaultOrderId ?? "");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});

    const formData = new FormData();
    if (orderId) formData.set("orderId", orderId);
    formData.set("rating", String(rating));
    formData.set("category", category);
    if (title.trim()) formData.set("title", title.trim());
    formData.set("message", message);

    const result = await submitFeedbackAction(formData);

    if (!result.ok) {
      setError(result.error.message);
      if ("fields" in result && result.fields) setFields(result.fields);
      setSaving(false);
      return;
    }

    setDone(true);
    setSaving(false);
    router.refresh();
  }

  if (done) {
    return (
      <div className="washi-panel p-5 text-center">
        <CheckCircle2 className="mx-auto size-10 text-jade-600" aria-hidden="true" />
        <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
          Thank you for telling us
        </h2>
        <p className="mt-1.5 text-sm text-ink-700/85">
          A real person reads every message. If you asked for a reply, you will find it in
          your messages.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => router.push("/orders")}>
            Your orders
          </Button>
          <Button
            onClick={() => {
              setDone(false);
              setRating(0);
              setMessage("");
              setTitle("");
            }}
          >
            Send more feedback
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="washi-panel p-5" noValidate>
      <h2 className="font-display text-lg font-semibold text-ink-900">
        Tell us how it went
      </h2>
      <p className="mt-1 text-sm text-ink-700/80">
        Good or bad, it goes straight to the kitchen and helps us get better.
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

      {/* Rating */}
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink-900">Your rating</legend>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => {
            const active = value <= (hovered || rating);
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                onMouseEnter={() => setHovered(value)}
                onMouseLeave={() => setHovered(0)}
                aria-label={`${value} out of 5`}
                aria-pressed={rating === value}
                className="grid size-11 place-items-center rounded-lg hover:bg-rice-200"
              >
                <Star
                  className={cn(
                    "size-7 transition-colors",
                    active ? "fill-miso-500 text-miso-500" : "text-ink-900/25",
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
          {rating > 0 ? (
            <span className="ml-2 text-sm text-ink-700/80">{RATING_LABELS[rating]}</span>
          ) : null}
        </div>
        {fields.rating ? (
          <p className="mt-1 text-xs text-chili-600">{fields.rating}</p>
        ) : null}
      </fieldset>

      {/* Category */}
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink-900">What is this about?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setCategory(option.key)}
              aria-pressed={category === option.key}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm transition-colors",
                category === option.key
                  ? "border-plum-600 bg-plum-600 text-rice-50"
                  : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Order link */}
      {orders.length > 0 ? (
        <div className="mt-4">
          <label htmlFor="feedback-order" className="block text-sm font-medium text-ink-900">
            Which order?
          </label>
          <p className="mt-0.5 text-xs text-ink-700/65">
            Optional. Linking an order lets the kitchen see exactly what you received.
          </p>
          <select
            id="feedback-order"
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

      <div className="mt-4">
        <label htmlFor="feedback-title" className="block text-sm font-medium text-ink-900">
          Short summary
        </label>
        <p className="mt-0.5 text-xs text-ink-700/65">Optional.</p>
        <input
          id="feedback-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          placeholder="Ramen was perfect, delivery was quick…"
          className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
        />
        {fields.title ? (
          <p className="mt-1 text-xs text-chili-600">{fields.title}</p>
        ) : null}
      </div>

      <div className="mt-4">
        <label
          htmlFor="feedback-message"
          className="block text-sm font-medium text-ink-900"
        >
          Your message
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          maxLength={2000}
          required
          placeholder="What did you like? What could we do better?"
          aria-invalid={fields.message ? true : undefined}
          className={cn(
            "mt-1.5 w-full rounded-xl border bg-rice-50 px-3 py-2 text-sm outline-none",
            fields.message
              ? "border-chili-500/50 focus:border-chili-500"
              : "border-ink-900/12 focus:border-miso-500",
          )}
        />
        <div className="mt-1 flex justify-between text-xs text-ink-700/60">
          <span>{fields.message ? <span className="text-chili-600">{fields.message}</span> : ""}</span>
          <span className="tabular-nums">{message.length}/2000</span>
        </div>
      </div>

      <Button type="submit" size="lg" className="mt-5 w-full" loading={saving}>
        Send feedback
      </Button>

      <p className="mt-3 text-center text-[11px] text-ink-700/60">
        Your feedback is only visible to Panda Wok staff. Your name is never shown
        publicly.
      </p>
    </form>
  );
}
