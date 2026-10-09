import { describe, expect, it } from "vitest";
import {
  formatClock,
  isWithinWindow,
  localMinutes,
  parseClock,
  resolveStoreAvailability,
  type StoreHours,
} from "@/lib/services/store-hours";

const base: StoreHours = {
  enabled: true,
  openTime: "14:00",
  closeTime: "01:00",
  timeZone: "Africa/Cairo",
};

/** Cairo is UTC+3 (EEST) across September, so local = UTC + 3. */
const cairo = (iso: string) => new Date(iso);

describe("parseClock", () => {
  it("accepts real 24h times", () => {
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("14:00")).toBe(840);
    expect(parseClock("23:59")).toBe(1439);
    expect(parseClock(" 09:05 ")).toBe(545);
  });

  it("rejects malformed values rather than coercing them", () => {
    for (const bad of ["24:00", "12:60", "9:00", "14", "abc", "", "2:00 pm"]) {
      expect(parseClock(bad)).toBeNull();
    }
  });
});

describe("localMinutes", () => {
  it("reads the restaurant clock, not UTC", () => {
    // 12:00 UTC is 15:00 in Cairo.
    expect(localMinutes(cairo("2026-09-30T12:00:00Z"), "Africa/Cairo")).toBe(15 * 60);
    expect(localMinutes(cairo("2026-09-30T12:00:00Z"), "UTC")).toBe(12 * 60);
  });

  it("wraps to 0 just after local midnight", () => {
    // 21:00 UTC is 00:00 in Cairo.
    expect(localMinutes(cairo("2026-09-30T21:00:00Z"), "Africa/Cairo")).toBe(0);
  });
});

describe("isWithinWindow", () => {
  it("handles a same-day window", () => {
    expect(isWithinWindow(600, 540, 660)).toBe(true); // 10:00 in 09:00-11:00
    expect(isWithinWindow(539, 540, 660)).toBe(false); // 08:59
    expect(isWithinWindow(660, 540, 660)).toBe(false); // close is exclusive
  });

  it("handles a window that crosses midnight", () => {
    const open = parseClock("14:00")!;
    const close = parseClock("01:00")!;
    expect(isWithinWindow(parseClock("14:00")!, open, close)).toBe(true);
    expect(isWithinWindow(parseClock("23:30")!, open, close)).toBe(true);
    expect(isWithinWindow(parseClock("00:30")!, open, close)).toBe(true);
    expect(isWithinWindow(parseClock("01:00")!, open, close)).toBe(false);
    expect(isWithinWindow(parseClock("12:00")!, open, close)).toBe(false);
  });

  it("treats an equal open/close as a full day", () => {
    expect(isWithinWindow(0, 600, 600)).toBe(true);
    expect(isWithinWindow(1439, 600, 600)).toBe(true);
  });
});

describe("resolveStoreAvailability", () => {
  it("is open inside the window", () => {
    const result = resolveStoreAvailability(base, true, cairo("2026-09-30T12:00:00Z")); // 15:00 local
    expect(result.open).toBe(true);
    expect(result.reason).toBe("open");
  });

  it("is closed outside the window and reports why", () => {
    const result = resolveStoreAvailability(base, true, cairo("2026-09-30T09:00:00Z")); // 12:00 local
    expect(result.open).toBe(false);
    expect(result.reason).toBe("outside_hours");
  });

  it("stays open after midnight until the close time", () => {
    expect(resolveStoreAvailability(base, true, cairo("2026-09-30T21:30:00Z")).open).toBe(true); // 00:30
    expect(resolveStoreAvailability(base, true, cairo("2026-09-30T22:30:00Z")).open).toBe(false); // 01:30
  });

  it("lets the manual switch close the store inside opening hours", () => {
    const result = resolveStoreAvailability(base, false, cairo("2026-09-30T12:00:00Z"));
    expect(result.open).toBe(false);
    expect(result.reason).toBe("manual_override");
  });

  it("never lets the clock force the store open when the switch is off", () => {
    const result = resolveStoreAvailability(base, false, cairo("2026-09-30T21:30:00Z"));
    expect(result.open).toBe(false);
  });

  it("ignores the clock entirely when hours are disabled", () => {
    const disabled = { ...base, enabled: false };
    expect(resolveStoreAvailability(disabled, true, cairo("2026-09-30T09:00:00Z")).open).toBe(true);
    expect(resolveStoreAvailability(disabled, false, cairo("2026-09-30T12:00:00Z")).open).toBe(false);
  });

  it("fails open on a malformed window so a typo cannot shut the kitchen", () => {
    const broken = { ...base, openTime: "nope" };
    const result = resolveStoreAvailability(broken, true, cairo("2026-09-30T09:00:00Z"));
    expect(result.open).toBe(true);
    expect(result.reason).toBe("open");
  });

  it("still honours the manual switch when the window is malformed", () => {
    const broken = { ...base, closeTime: "99:99" };
    expect(resolveStoreAvailability(broken, false, cairo("2026-09-30T12:00:00Z")).open).toBe(false);
  });
});

describe("formatClock", () => {
  it("renders 12-hour time in both locales", () => {
    expect(formatClock("14:00", "en")).toBe("2:00 PM");
    expect(formatClock("01:00", "en")).toBe("1:00 AM");
    expect(formatClock("00:15", "en")).toBe("12:15 AM");
    expect(formatClock("12:30", "en")).toBe("12:30 PM");
    expect(formatClock("14:00", "ar")).toContain("م");
    expect(formatClock("01:00", "ar")).toContain("ص");
  });

  it("returns malformed input unchanged rather than inventing a time", () => {
    expect(formatClock("later", "en")).toBe("later");
  });
});
