/**
 * Opening hours, resolved from settings rather than hardcoded.
 *
 * The owner picks the window in Admin -> Settings (`ordering.open_time` /
 * `ordering.close_time`, 24h "HH:MM", plus `ordering.hours_enabled`). A window
 * that crosses midnight (for example 14:00 -> 01:00) is supported, because that
 * is the normal shape for a restaurant that closes after midnight.
 *
 * The window is evaluated in the *restaurant's* timezone, not the visitor's or
 * the Worker's (Workers run in UTC). A customer in another timezone must see the
 * kitchen's real hours, not their own clock's.
 *
 * Deliberately NOT `server-only`: the whole module is pure date arithmetic with
 * no secrets and no I/O, and the checkout client needs `formatClock` to render
 * the reopening time. Keeping it importable from both sides avoids duplicating
 * the parsing rules, which is how a preview and the server drift apart.
 */

export const STORE_TIME_ZONE = "Africa/Cairo";

export type StoreHours = {
  enabled: boolean;
  /** "HH:MM" 24-hour, restaurant-local. */
  openTime: string;
  closeTime: string;
  timeZone: string;
};

export type StoreAvailability = {
  /** True only when the manual switch is on AND the clock is inside the window. */
  open: boolean;
  /** Machine-readable reason, for callers that want to explain the state. */
  reason: "open" | "disabled" | "outside_hours" | "manual_override";
  /** Local "HH:MM" the kitchen opens, when known. */
  openTime: string;
  closeTime: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parses "HH:MM" into minutes past local midnight, or null when malformed. */
export function parseClock(value: string): number | null {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Local minutes-past-midnight for `now` in `timeZone`. `Intl` is used rather
 * than arithmetic on the epoch, because the offset changes with DST and the
 * Worker has no local clock.
 */
export function localMinutes(now: Date, timeZone: string = STORE_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour % 24) * 60 + minute;
}

/**
 * True when `minutes` falls inside the window. A window whose close is at or
 * before its open crosses midnight, so the check inverts to "after open OR
 * before close" instead of the plain between test.
 */
export function isWithinWindow(minutes: number, openMinutes: number, closeMinutes: number): boolean {
  if (openMinutes === closeMinutes) return true; // a full-day window
  if (openMinutes < closeMinutes) return minutes >= openMinutes && minutes < closeMinutes;
  return minutes >= openMinutes || minutes < closeMinutes;
}

/**
 * Decides whether the storefront is taking orders right now.
 *
 * `manualOpen` is the owner's on/off switch (`ordering.accepting_orders`). It is
 * authoritative when hours are disabled, and a hard veto when they are enabled:
 * the owner can always close early, and the clock can never force the store open
 * outside the configured window.
 */
export function resolveStoreAvailability(
  hours: StoreHours,
  manualOpen: boolean,
  now: Date = new Date(),
): StoreAvailability {
  const openMinutes = parseClock(hours.openTime);
  const closeMinutes = parseClock(hours.closeTime);

  // A malformed window must never close the store — the safe failure for a
  // restaurant is "open and taking orders", not "silently shut".
  if (!hours.enabled || openMinutes === null || closeMinutes === null) {
    return {
      open: manualOpen,
      reason: manualOpen ? "open" : "manual_override",
      openTime: hours.openTime,
      closeTime: hours.closeTime,
    };
  }

  if (!manualOpen) {
    return {
      open: false,
      reason: "manual_override",
      openTime: hours.openTime,
      closeTime: hours.closeTime,
    };
  }

  const inside = isWithinWindow(localMinutes(now, hours.timeZone), openMinutes, closeMinutes);
  return {
    open: inside,
    reason: inside ? "open" : "outside_hours",
    openTime: hours.openTime,
    closeTime: hours.closeTime,
  };
}

/** "14:00" -> "2:00 PM" for display. Returns the input when malformed. */
export function formatClock(value: string, locale: "en" | "ar" = "en"): string {
  const minutes = parseClock(value);
  if (minutes === null) return value;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = locale === "ar" ? (hour24 < 12 ? "ص" : "م") : hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
