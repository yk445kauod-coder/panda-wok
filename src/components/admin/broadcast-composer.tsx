"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Eye, Megaphone } from "lucide-react";
import {
  AdminForm,
  Field,
  TextArea,
  Toggle,
} from "@/components/admin/form-kit";
import { Badge } from "@/components/ui/button";
import { createBroadcastAction } from "@/lib/actions/admin";
import { formatNumber } from "@/lib/utils/format";
import type { Database } from "@/lib/types/database";

type Channel = Database["public"]["Enums"]["broadcast_channel"];

export type SegmentOption = {
  key: string;
  label: string;
  count: number;
  valueLabel?: string;
  defaultValue?: number;
};

const CHANNELS: { key: Channel; label: string; hint: string }[] = [
  { key: "in_app", label: "In-app", hint: "Notification inside Panda Wok." },
  { key: "push", label: "Push", hint: "Device push where the customer allowed it." },
  { key: "email", label: "Email", hint: "Email to opted-in addresses only." },
  { key: "sms", label: "SMS", hint: "Text message — costs money per send." },
];

/**
 * Broadcast composer. The send is deliberately two-step: the operator reviews
 * the exact audience, count and message, then ticks an explicit confirmation.
 * The server action rejects an unconfirmed send regardless of the UI state.
 */
export function BroadcastComposer({
  segments,
  defaultSegment,
  defaultSegmentValue = 30,
}: {
  segments: SegmentOption[];
  defaultSegment: string;
  defaultSegmentValue?: number;
}) {
  const [segmentKey, setSegmentKey] = useState(defaultSegment);
  const [channel, setChannel] = useState<Channel>("in_app");
  const [reviewing, setReviewing] = useState(false);

  const segment = useMemo(
    () => segments.find((option) => option.key === segmentKey) ?? segments[0],
    [segments, segmentKey],
  );

  const channelMeta = CHANNELS.find((item) => item.key === channel) ?? CHANNELS[0];

  return (
    <AdminForm
      action={createBroadcastAction}
      submitLabel={reviewing ? "Send broadcast now" : "Review before sending"}
      options={{ successMessage: "Broadcast sent. Recipients are listed below." }}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <Field
          name="title"
          label="Title"
          hint="Short and specific — it is the first thing a customer sees."
          placeholder="Ramadan offer: 20% off mixed grills"
        />

        <TextArea
          name="body"
          label="Message"
          rows={5}
          hint="Plain text. Keep it to one idea and one action."
          placeholder="Order any mixed grill tonight and get 20% off. Offer ends at midnight."
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-900">Channel</legend>
          <input type="hidden" name="channel" value={channel} />
          <div className="grid gap-2 sm:grid-cols-2">
            {CHANNELS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setChannel(option.key)}
                aria-pressed={channel === option.key}
                className={
                  channel === option.key
                    ? "rounded-xl border border-vermilion-600 bg-vermilion-600/8 p-3 text-left"
                    : "rounded-xl border border-ink-900/12 bg-rice-50 p-3 text-left hover:bg-rice-100"
                }
              >
                <span className="block text-sm font-medium text-ink-900">{option.label}</span>
                <span className="mt-0.5 block text-xs text-ink-700/70">{option.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="segment" className="block text-sm font-medium text-ink-900">
              Audience
            </label>
            <select
              id="segment"
              name="segment"
              value={segmentKey}
              onChange={(event) => {
                setSegmentKey(event.target.value);
                setReviewing(false);
              }}
              className="mt-1.5 h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 px-3 text-sm outline-none focus:border-miso-500"
            >
              {segments.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} ({formatNumber(option.count)})
                </option>
              ))}
            </select>
          </div>

          <Field
            name="segmentValue"
            label={segment?.valueLabel ?? "Segment threshold"}
            type="number"
            defaultValue={String(segment?.defaultValue ?? defaultSegmentValue)}
            hint={
              segment?.valueLabel
                ? "Used only by segments that take a threshold."
                : "Not used by this segment."
            }
            key={`segment-value-${segmentKey}`}
          />
        </div>

        <div
          className={
            reviewing
              ? "space-y-3 rounded-xl border border-miso-500/40 bg-miso-500/8 p-4"
              : "space-y-3 rounded-xl border border-ink-900/12 bg-rice-100/60 p-4"
          }
        >
          <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
            <Eye className="size-4" aria-hidden="true" />
            Confirm the send
          </p>
          <p className="text-xs text-ink-700/80">
            This sends to real customers and cannot be unsent. Review the audience and
            the message, then tick the box to arm the send button.
          </p>
          <Toggle
            name="confirm"
            label="I have checked the audience and the message"
            hint="Required. The server refuses the send without it."
          />
        </div>
      </div>

      <aside className="washi-panel h-fit space-y-4 p-4 lg:sticky lg:top-6">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-vermilion-600" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-ink-900">Audience preview</h2>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-700/80">Target audience</dt>
            <dd className="text-right font-medium text-ink-900">
              {segment?.label ?? "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-700/80">Estimated recipients</dt>
            <dd className="text-right font-semibold tabular-nums text-ink-900">
              {formatNumber(segment?.count ?? 0)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-700/80">Channel</dt>
            <dd className="text-right">
              <Badge tone="info">{channelMeta.label}</Badge>
            </dd>
          </div>
        </dl>

        <p className="text-[11px] text-ink-700/60">
          The count is a live estimate from the CRM segment definition. The final
          recipient list is resolved by the database at send time, so the two never
          drift apart.
        </p>

        {channel === "sms" ? (
          <p className="flex items-start gap-2 rounded-lg bg-miso-500/12 p-2.5 text-[11px] text-miso-600">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            SMS is billed per message. Check the count before confirming.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setReviewing((value) => !value)}
          className="w-full rounded-xl border border-ink-900/15 px-3 py-2 text-xs font-medium text-ink-900 hover:bg-rice-100"
        >
          {reviewing ? "Hide the confirmation step" : "I am ready — show the confirmation step"}
        </button>
      </aside>
      </div>
    </AdminForm>
  );
}
