"use client";

import { useState } from "react";
import { Clock, Moon, Power } from "lucide-react";
import { AdminForm } from "@/components/admin/form-kit";
import { updateSettingsAction } from "@/lib/actions/admin";
import { useI18n } from "@/components/i18n-provider";
import {
  formatClock,
  localMinutes,
  parseClock,
  resolveStoreAvailability,
  type StoreHours,
} from "@/lib/services/store-hours";
import { cn } from "@/lib/utils/format";

/**
 * Visual control for the ordering window.
 *
 * The owner asked to pick opening hours "freely from the admin panel, in an easy
 * graphical way" — not to type `ordering.open_time` into a jsonb box. This
 * renders the four related settings (`ordering.accepting_orders`,
 * `ordering.hours_enabled`, `ordering.open_time`, `ordering.close_time`) as one
 * control: a master switch, a window toggle, two time pickers, a 24-hour bar
 * that shows the open span, and a live "right now" preview.
 *
 * The preview runs the *same* `resolveStoreAvailability` the server uses, so
 * what the owner sees here and what the checkout enforces cannot disagree — the
 * one class of bug this screen must not reintroduce (see the tax-rate drift in
 * AGENTS.md).
 */

const SETTING_KEYS = {
  accepting: "ordering.accepting_orders",
  enabled: "ordering.hours_enabled",
  open: "ordering.open_time",
  close: "ordering.close_time",
} as const;

type Props = {
  acceptingOrders: boolean;
  hours: StoreHours;
};

/** The two open spans of a window, as [startMinutes, endMinutes] pairs. */
function openSpans(openMinutes: number, closeMinutes: number): [number, number][] {
  if (openMinutes === closeMinutes) return [[0, 1440]];
  if (openMinutes < closeMinutes) return [[openMinutes, closeMinutes]];
  // Crosses midnight: open to the end of the day, then start of day to close.
  return [
    [openMinutes, 1440],
    [0, closeMinutes],
  ];
}

export function StoreHoursControl({ acceptingOrders, hours }: Props) {
  const { t, locale } = useI18n();

  const [accepting, setAccepting] = useState(acceptingOrders);
  const [enabled, setEnabled] = useState(hours.enabled);
  const [openTime, setOpenTime] = useState(hours.openTime);
  const [closeTime, setCloseTime] = useState(hours.closeTime);

  const draft: StoreHours = { enabled, openTime, closeTime, timeZone: hours.timeZone };
  const availability = resolveStoreAvailability(draft, accepting);

  const openMinutes = parseClock(openTime);
  const closeMinutes = parseClock(closeTime);
  const spans =
    openMinutes !== null && closeMinutes !== null ? openSpans(openMinutes, closeMinutes) : [];
  const crossesMidnight =
    openMinutes !== null && closeMinutes !== null && openMinutes > closeMinutes;

  const nowMinutes = localMinutes(new Date(), hours.timeZone);

  const previewText = !accepting
    ? t("admin.pages.settings.hours.previewManual")
    : !enabled
      ? t("admin.pages.settings.hours.previewDisabled")
      : availability.open
        ? t("admin.pages.settings.hours.previewOpen")
        : t("admin.pages.settings.hours.previewClosedUntil", { time: formatClock(openTime, locale) });

  const payload = JSON.stringify([
    { key: SETTING_KEYS.accepting, value: accepting },
    { key: SETTING_KEYS.enabled, value: enabled },
    { key: SETTING_KEYS.open, value: openTime },
    { key: SETTING_KEYS.close, value: closeTime },
  ]);

  function applyPreset(nextOpen: string, nextClose: string) {
    setOpenTime(nextOpen);
    setCloseTime(nextClose);
    setEnabled(true);
  }

  return (
    <section aria-label={t("admin.pages.settings.hours.title")} className="washi-panel p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-ink-900">
            {t("admin.pages.settings.hours.title")}
          </h3>
          <p className="mt-0.5 text-sm text-ink-700/80">
            {t("admin.pages.settings.hours.subtitle")}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            availability.open
              ? "bg-jade-500/12 text-jade-700"
              : "bg-chili-500/12 text-chili-600",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              availability.open ? "bg-jade-500" : "bg-chili-500",
            )}
          />
          {previewText}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Master switch */}
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-900/12 bg-rice-50 p-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg",
              accepting ? "bg-jade-500/15 text-jade-700" : "bg-chili-500/15 text-chili-600",
            )}
          >
            <Power className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink-900">
              {t("admin.pages.settings.hours.master")}
            </span>
            <span className="block text-xs text-ink-700/70">
              {accepting
                ? t("admin.pages.settings.hours.masterOn")
                : t("admin.pages.settings.hours.masterOff")}
            </span>
          </span>
          <input
            type="checkbox"
            checked={accepting}
            onChange={(event) => setAccepting(event.target.checked)}
            className="size-5 shrink-0 accent-vermilion-600"
            aria-label={t("admin.pages.settings.hours.master")}
          />
        </label>

        {/* Window toggle */}
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-900/12 bg-rice-50 p-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg",
              enabled ? "bg-vermilion-600/15 text-vermilion-700" : "bg-ink-900/8 text-ink-700",
            )}
          >
            <Clock className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink-900">
              {t("admin.pages.settings.hours.restrict")}
            </span>
            <span className="block text-xs text-ink-700/70">
              {t("admin.pages.settings.hours.restrictHint")}
            </span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-5 shrink-0 accent-vermilion-600"
            aria-label={t("admin.pages.settings.hours.restrict")}
          />
        </label>
      </div>

      {/* Time pickers + the 24-hour bar */}
      <div
        className={cn(
          "mt-4 rounded-xl border border-ink-900/12 bg-rice-50 p-3 transition-opacity",
          enabled ? "opacity-100" : "pointer-events-none opacity-50",
        )}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="block text-xs font-medium text-ink-800">
              {t("admin.pages.settings.hours.open")}
            </span>
            <input
              type="time"
              value={openTime}
              onChange={(event) => setOpenTime(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-ink-900/12 bg-white px-3 text-ink-900 outline-none focus:border-miso-500"
            />
          </label>
          <label className="flex-1">
            <span className="block text-xs font-medium text-ink-800">
              {t("admin.pages.settings.hours.close")}
            </span>
            <input
              type="time"
              value={closeTime}
              onChange={(event) => setCloseTime(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-ink-900/12 bg-white px-3 text-ink-900 outline-none focus:border-miso-500"
            />
          </label>
        </div>

        {crossesMidnight ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-vermilion-700">
            <Moon className="size-3.5" aria-hidden="true" />
            {t("admin.pages.settings.hours.overnight")}
          </p>
        ) : null}

        {/* A day at a glance: 00:00 -> 24:00, the open span filled. */}
        <div className="mt-3" aria-hidden="true">
          <div className="relative h-8 overflow-hidden rounded-lg border border-ink-900/10 bg-ink-900/8">
            {spans.map(([start, end], index) => (
              <span
                key={index}
                className="absolute inset-y-0 bg-vermilion-600/70"
                style={{ left: `${(start / 1440) * 100}%`, width: `${((end - start) / 1440) * 100}%` }}
              />
            ))}
            <span
              className="absolute inset-y-0 w-0.5 bg-ink-900"
              style={{ left: `${(nowMinutes / 1440) * 100}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-ink-700/60">
            <span>12 AM</span>
            <span>6 AM</span>
            <span>12 PM</span>
            <span>6 PM</span>
            <span>12 AM</span>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-ink-700/60">
          {t("admin.pages.settings.hours.timezone")}
        </p>

        {/* Presets */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-700">
            {t("admin.pages.settings.hours.preset")}:
          </span>
          <button
            type="button"
            onClick={() => applyPreset("14:00", "01:00")}
            className="rounded-full border border-ink-900/12 bg-white px-3 py-1 text-xs font-medium text-ink-800 transition-colors hover:bg-ink-900/5"
          >
            {t("admin.pages.settings.hours.presetAfternoon")}
          </button>
          <button
            type="button"
            onClick={() => applyPreset("12:00", "00:00")}
            className="rounded-full border border-ink-900/12 bg-white px-3 py-1 text-xs font-medium text-ink-800 transition-colors hover:bg-ink-900/5"
          >
            {t("admin.pages.settings.hours.presetNoon")}
          </button>
          <button
            type="button"
            onClick={() => setEnabled(false)}
            className="rounded-full border border-ink-900/12 bg-white px-3 py-1 text-xs font-medium text-ink-800 transition-colors hover:bg-ink-900/5"
          >
            {t("admin.pages.settings.hours.presetAllDay")}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <AdminForm
          action={updateSettingsAction}
          submitLabel={t("admin.pages.settings.hours.save")}
          options={{ successMessage: t("admin.pages.settings.hours.saved") }}
        >
          <input type="hidden" name="values" value={payload} />
        </AdminForm>
      </div>
    </section>
  );
}
