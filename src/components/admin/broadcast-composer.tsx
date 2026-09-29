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
import { useT } from "@/components/i18n-provider";
import type { Database } from "@/lib/types/database";

type Channel = Database["public"]["Enums"]["broadcast_channel"];

export type SegmentOption = {
  key: string;
  label: string;
  count: number;
  valueLabel?: string;
  defaultValue?: number;
};

const CHANNELS: { key: Channel; labelKey: string; hintKey: string }[] = [
  {
    key: "in_app",
    labelKey: "admin.pages.broadcast.inApp",
    hintKey: "admin.pages.broadcast.inAppHint",
  },
  {
    key: "push",
    labelKey: "admin.pages.broadcast.push",
    hintKey: "admin.pages.broadcast.pushHint",
  },
  {
    key: "email",
    labelKey: "admin.pages.broadcast.email",
    hintKey: "admin.pages.broadcast.emailHint",
  },
  {
    key: "sms",
    labelKey: "admin.pages.broadcast.sms",
    hintKey: "admin.pages.broadcast.smsHint",
  },
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
  const t = useT();
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
      submitLabel={
        reviewing
          ? t("admin.pages.broadcast.sendNow")
          : t("admin.pages.broadcast.review")
      }
      options={{ successMessage: t("admin.pages.broadcast.sentToast") }}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <Field
          name="title"
          label={t("admin.pages.broadcast.composer.title")}
          hint={t("admin.pages.broadcast.composer.titleHint")}
          placeholder={t("admin.pages.broadcast.composer.titlePlaceholder")}
        />

        <TextArea
          name="body"
          label={t("admin.pages.broadcast.composer.message")}
          rows={5}
          hint={t("admin.pages.broadcast.composer.messageHint")}
          placeholder={t("admin.pages.broadcast.composer.messagePlaceholder")}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-900">
            {t("admin.pages.broadcast.composer.channel")}
          </legend>
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
                <span className="block text-sm font-medium text-ink-900">
                  {t(option.labelKey)}
                </span>
                <span className="mt-0.5 block text-xs text-ink-700/70">
                  {t(option.hintKey)}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="segment" className="block text-sm font-medium text-ink-900">
              {t("admin.pages.broadcast.composer.audience")}
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
            label={segment?.valueLabel ?? t("admin.pages.broadcast.composer.thresholdDefault")}
            type="number"
            defaultValue={String(segment?.defaultValue ?? defaultSegmentValue)}
            hint={
              segment?.valueLabel
                ? t("admin.pages.broadcast.composer.thresholdHint")
                : t("admin.pages.broadcast.composer.thresholdUnused")
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
            {t("admin.pages.broadcast.composer.confirmTitle")}
          </p>
          <p className="text-xs text-ink-700/80">
            {t("admin.pages.broadcast.composer.confirmBody")}
          </p>
          <Toggle
            name="confirm"
            label={t("admin.pages.broadcast.composer.confirmLabel")}
            hint={t("admin.pages.broadcast.composer.confirmHint")}
          />
        </div>
      </div>

      <aside className="washi-panel h-fit space-y-4 p-4 lg:sticky lg:top-6">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-vermilion-600" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-ink-900">
            {t("admin.pages.broadcast.composer.preview")}
          </h2>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-700/80">
              {t("admin.pages.broadcast.composer.targetAudience")}
            </dt>
            <dd className="text-right font-medium text-ink-900">
              {segment?.label ?? "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-700/80">
              {t("admin.pages.broadcast.composer.estimatedRecipients")}
            </dt>
            <dd className="text-right font-semibold tabular-nums text-ink-900">
              {formatNumber(segment?.count ?? 0)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-700/80">
              {t("admin.pages.broadcast.composer.channel")}
            </dt>
            <dd className="text-right">
              <Badge tone="info">{t(channelMeta.labelKey)}</Badge>
            </dd>
          </div>
        </dl>

        <p className="text-[11px] text-ink-700/60">
          {t("admin.pages.broadcast.composer.previewNote")}
        </p>

        {channel === "sms" ? (
          <p className="flex items-start gap-2 rounded-lg bg-miso-500/12 p-2.5 text-[11px] text-miso-600">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t("admin.pages.broadcast.composer.smsWarning")}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setReviewing((value) => !value)}
          className="w-full rounded-xl border border-ink-900/15 px-3 py-2 text-xs font-medium text-ink-900 hover:bg-rice-100"
        >
          {reviewing
            ? t("admin.pages.broadcast.composer.hideConfirm")
            : t("admin.pages.broadcast.composer.showConfirm")}
        </button>
      </aside>
      </div>
    </AdminForm>
  );
}
