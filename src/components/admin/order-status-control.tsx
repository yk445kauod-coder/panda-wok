"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { updateOrderStatusAction } from "@/lib/actions/admin";
import { useErrorText } from "@/components/i18n-provider";
import {
  ORDER_STATUS_LABELS,
  allowedTransitions,
  type OrderStatus,
} from "@/lib/services/order-workflow";

/**
 * Status control for one order. Only transitions the state machine permits are
 * offered, so the UI cannot request a move the server would reject.
 */
export function OrderStatusControl({
  orderId,
  current,
  compact = false,
}: {
  orderId: string;
  current: OrderStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = allowedTransitions(current);

  async function apply(status: OrderStatus) {
    setPending(status);
    setError(null);

    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("status", status);
    if (note.trim()) formData.set("note", note.trim());

    const result = await updateOrderStatusAction(formData);

    if (!result.ok) {
      setError(errorText(result.error));
      setPending(null);
      return;
    }

    setPending(null);
    setNote("");
    setOpen(false);
    router.refresh();
  }

  if (options.length === 0) {
    return (
      <p className="text-xs text-ink-700/65">
        {ORDER_STATUS_LABELS[current]} is final — no further changes.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {options.slice(0, 2).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => apply(status)}
            disabled={pending !== null}
            className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-rice-50 hover:bg-indigo-700 disabled:opacity-60"
          >
            {pending === status ? "…" : `→ ${ORDER_STATUS_LABELS[status]}`}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex h-10 w-full items-center justify-between rounded-xl border border-ink-900/15 bg-rice-50 px-3 text-sm text-ink-900 hover:bg-rice-100"
      >
        <span>Change status</span>
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="washi-panel space-y-3 p-3">
          <div>
            <label htmlFor={`note-${orderId}`} className="block text-xs font-medium text-ink-800">
              Note for the customer (optional)
            </label>
            <input
              id={`note-${orderId}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              placeholder="Rider is stuck in traffic"
              className="mt-1 h-10 w-full rounded-lg border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {options.map((status) => {
              const destructive = ["canceled", "rejected", "failed", "refunded"].includes(
                status,
              );
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => apply(status)}
                  disabled={pending !== null}
                  className={
                    destructive
                      ? "rounded-lg border border-chili-500/40 px-3 py-2 text-xs font-medium text-chili-600 hover:bg-chili-500/10 disabled:opacity-60"
                      : "rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-rice-50 hover:bg-indigo-700 disabled:opacity-60"
                  }
                >
                  {pending === status ? "Updating…" : ORDER_STATUS_LABELS[status]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-chili-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
