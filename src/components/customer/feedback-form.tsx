"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/format";
import { useErrorText, useT } from "@/components/i18n-provider";
import { submitFeedbackAction } from "@/lib/actions/communication";

const CATEGORY_KEYS = [
  "overall",
  "food_quality",
  "delivery",
  "service",
  "other",
] as const;

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
  const t = useT();
  const errorText = useErrorText();
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [category, setCategory] = useState<(typeof CATEGORY_KEYS)[number]>("overall");
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
      setError(errorText(result.error));
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
          {t("feedback.doneTitle")}
        </h2>
        <p className="mt-1.5 text-sm text-ink-700/85">{t("feedback.doneBody")}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => router.push("/orders")}>
            {t("feedback.yourOrders")}
          </Button>
          <Button
            onClick={() => {
              setDone(false);
              setRating(0);
              setMessage("");
              setTitle("");
            }}
          >
            {t("feedback.sendMore")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="washi-panel p-5" noValidate>
      <h2 className="font-display text-lg font-semibold text-ink-900">
        {t("feedback.formHeading")}
      </h2>
      <p className="mt-1 text-sm text-ink-700/80">{t("feedback.formBody")}</p>

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
        <legend className="text-sm font-medium text-ink-900">
          {t("feedback.yourRating")}
        </legend>
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
                aria-label={t("feedback.ratingAria", { value })}
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
            <span className="ms-2 text-sm text-ink-700/80">
              {t(`feedback.rating.${rating}`)}
            </span>
          ) : null}
        </div>
        {fields.rating ? (
          <p className="mt-1 text-xs text-chili-600">{fields.rating}</p>
        ) : null}
      </fieldset>

      {/* Category */}
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink-900">
          {t("feedback.categoryHeading")}
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              aria-pressed={category === key}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm transition-colors",
                category === key
                  ? "border-plum-600 bg-plum-600 text-rice-50"
                  : "border-ink-900/12 bg-rice-50 text-ink-800 hover:bg-rice-200",
              )}
            >
              {t(`feedback.categories.${key}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Order link */}
      {orders.length > 0 ? (
        <div className="mt-4">
          <label htmlFor="feedback-order" className="block text-sm font-medium text-ink-900">
            {t("feedback.orderLabel")}
          </label>
          <p className="mt-0.5 text-xs text-ink-700/65">{t("feedback.orderHint")}</p>
          <select
            id="feedback-order"
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
          >
            <option value="">{t("feedback.orderGeneral")}</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {`#${order.orderNumber}`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-4">
        <label htmlFor="feedback-title" className="block text-sm font-medium text-ink-900">
          {t("feedback.categoryLabel")}
        </label>
        <p className="mt-0.5 text-xs text-ink-700/65">{t("feedback.categoryOptional")}</p>
        <input
          id="feedback-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          placeholder={t("feedback.titlePlaceholder")}
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
          {t("feedback.messageLabel")}
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          maxLength={2000}
          required
          placeholder={t("feedback.messagePlaceholder")}
          aria-invalid={fields.message ? true : undefined}
          className={cn(
            "mt-1.5 w-full rounded-xl border bg-rice-50 px-3 py-2 text-sm outline-none",
            fields.message
              ? "border-chili-500/50 focus:border-chili-500"
              : "border-ink-900/12 focus:border-miso-500",
          )}
        />
        <div className="mt-1 flex justify-between text-xs text-ink-700/60">
          <span>
            {fields.message ? (
              <span className="text-chili-600">{fields.message}</span>
            ) : (
              ""
            )}
          </span>
          <span className="tabular-nums">{message.length}/2000</span>
        </div>
      </div>

      <Button type="submit" size="lg" className="mt-5 w-full" loading={saving}>
        {t("feedback.submit")}
      </Button>

      <p className="mt-3 text-center text-[11px] text-ink-700/60">
        {t("feedback.privacyNote")}
      </p>
    </form>
  );
}
